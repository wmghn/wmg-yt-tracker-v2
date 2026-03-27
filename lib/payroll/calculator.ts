import { Decimal } from "@prisma/client/runtime/client";
import { db } from "@/lib/db";
import type { PayrollRecord } from "@prisma/client";

export type PayrollDetailItem = {
  videoId: string;
  videoTitle: string;
  youtubeVideoId: string;
  role: string;
  views: number;
  weightPercent: string;
  bonusPerThousandViews: string;
  bonus: string;
};

export type PayrollPreview = {
  userId: string;
  userName: string;
  baseSalary: string;
  totalViews: number;
  totalBonus: string;
  totalSalary: string;
  detail: PayrollDetailItem[];
};

// ─── Internal types for batch-fetched data ────────────────────────────────────

type Assignment = {
  id: string;
  videoId: string;
  role: string;
  video: {
    id: string;
    title: string;
    youtubeVideoId: string;
    channelId: string;
  };
};

type ComputedDetail = {
  detail: PayrollDetailItem[];
  totalViews: bigint;
  totalBonus: Decimal;
};

// ─── PayrollCalculator ────────────────────────────────────────────────────────

export class PayrollCalculator {
  // ────────────────────────────────────────────────────────────────────────────
  // Lấy SalaryConfig hiệu lực mới nhất của user (effectiveFrom <= now)
  // ────────────────────────────────────────────────────────────────────────────
  private async getActiveSalaryConfig(userId: string) {
    return db.salaryConfig.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Batch fetch views cho một khoảng thời gian từ AnalyticsSnapshot
  // Trả về Map<videoId, views>
  // ────────────────────────────────────────────────────────────────────────────
  private async batchGetPeriodViews(
    videoIds: string[],
    month: number,
    year: number
  ): Promise<Map<string, bigint>> {
    if (videoIds.length === 0) return new Map();

    // Tính startDate/endDate cho tháng
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    type Row = { videoId: string; views: bigint };
    const rows = await db.$queryRaw<Row[]>`
      SELECT "videoId", views
      FROM analytics_snapshots
      WHERE "videoId" = ANY(${videoIds}::text[])
        AND "startDate" = ${startDate}::date
        AND date = ${endDate}::date
    `;

    const map = new Map<string, bigint>();
    for (const row of rows) {
      map.set(row.videoId, BigInt(row.views));
    }
    return map;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fallback: lấy latest cumulative views từ VideoViewsLog (dùng cho preview
  // khi chưa có AnalyticsSnapshot cho tháng hiện tại)
  // ────────────────────────────────────────────────────────────────────────────
  private async batchGetLatestViews(
    videoIds: string[]
  ): Promise<Map<string, bigint>> {
    if (videoIds.length === 0) return new Map();

    type Row = { videoId: string; viewsCount: bigint };
    const rows = await db.$queryRaw<Row[]>`
      SELECT DISTINCT ON ("videoId") "videoId", "viewsCount"
      FROM video_views_log
      WHERE "videoId" = ANY(${videoIds}::text[])
      ORDER BY "videoId", "recordedAt" DESC
    `;

    const map = new Map<string, bigint>();
    for (const row of rows) {
      map.set(row.videoId, BigInt(row.viewsCount));
    }
    return map;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Batch fetch weight configs cho nhiều (channelId, role) cùng lúc
  // ────────────────────────────────────────────────────────────────────────────
  private async batchGetWeightConfigs(
    pairs: Array<{ channelId: string; role: string }>
  ): Promise<Map<string, Decimal>> {
    if (pairs.length === 0) return new Map();

    // Unique channel+role pairs
    const uniqueKeys = new Set(pairs.map((p) => `${p.channelId}:${p.role}`));
    const uniquePairs = Array.from(uniqueKeys).map((k) => {
      const [channelId, role] = k.split(":");
      return { channelId, role };
    });

    const map = new Map<string, Decimal>();

    // Fetch tất cả weight configs hiệu lực bằng 1 query
    type Row = { channelId: string; role: string; weightPercent: Decimal };
    const rows = await db.$queryRaw<Row[]>`
      SELECT DISTINCT ON ("channelId", role) "channelId", role::text, "weightPercent"
      FROM channel_weight_configs
      WHERE "effectiveFrom" <= NOW()
      ORDER BY "channelId", role, "effectiveFrom" DESC
    `;

    for (const row of rows) {
      map.set(`${row.channelId}:${row.role}`, new Decimal(row.weightPercent.toString()));
    }

    // Đảm bảo mỗi pair đều có giá trị (default 50)
    for (const pair of uniquePairs) {
      const key = `${pair.channelId}:${pair.role}`;
      if (!map.has(key)) {
        map.set(key, new Decimal(50));
      }
    }

    return map;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Batch count: bao nhiêu người cùng role trên mỗi video
  // ────────────────────────────────────────────────────────────────────────────
  private async batchGetSameRoleCounts(
    pairs: Array<{ videoId: string; role: string }>
  ): Promise<Map<string, number>> {
    if (pairs.length === 0) return new Map();

    type Row = { videoId: string; role: string; cnt: bigint };
    const rows = await db.$queryRaw<Row[]>`
      SELECT "videoId", role::text, COUNT(*)::bigint AS cnt
      FROM video_role_assignments
      WHERE status = 'APPROVED'
      GROUP BY "videoId", role
    `;

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(`${row.videoId}:${row.role}`, Number(row.cnt));
    }
    return map;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Core logic: tính chi tiết bonus cho danh sách assignments
  // Dùng chung cho cả calculateForUser và preview
  // ────────────────────────────────────────────────────────────────────────────
  private async computeDetail(
    assignments: Assignment[],
    bonusPerThousandViews: Decimal,
    month: number,
    year: number
  ): Promise<ComputedDetail> {
    if (assignments.length === 0) {
      return { detail: [], totalViews: BigInt(0), totalBonus: new Decimal(0) };
    }

    const videoIds = assignments.map((a) => a.video.id);

    // Batch fetch all data in parallel (thay vì N+1 queries)
    const [viewsMap, weightMap, roleCountMap] = await Promise.all([
      this.batchGetPeriodViews(videoIds, month, year).then(async (periodMap) => {
        // Nếu thiếu views cho một số video, fallback sang cumulative views
        const missingIds = videoIds.filter((id) => !periodMap.has(id));
        if (missingIds.length > 0) {
          const fallbackMap = await this.batchGetLatestViews(missingIds);
          for (const [id, views] of fallbackMap) {
            periodMap.set(id, views);
          }
        }
        return periodMap;
      }),
      this.batchGetWeightConfigs(
        assignments.map((a) => ({ channelId: a.video.channelId, role: a.role }))
      ),
      this.batchGetSameRoleCounts(
        assignments.map((a) => ({ videoId: a.video.id, role: a.role }))
      ),
    ]);

    const detail: PayrollDetailItem[] = [];
    let totalViews = BigInt(0);
    let totalBonus = new Decimal(0);

    for (const assignment of assignments) {
      const views = viewsMap.get(assignment.video.id) ?? BigInt(0);
      const weightPercent =
        weightMap.get(`${assignment.video.channelId}:${assignment.role}`) ?? new Decimal(50);
      const sameRoleCount =
        roleCountMap.get(`${assignment.video.id}:${assignment.role}`) ?? 1;

      const effectiveWeight = weightPercent.div(new Decimal(Math.max(1, sameRoleCount)));

      // bonus = (views / 1000) * bonusPerThousandViews * (effectiveWeight / 100)
      const viewsDecimal = new Decimal(views.toString());
      const bonus = viewsDecimal
        .div(new Decimal(1000))
        .mul(bonusPerThousandViews)
        .mul(effectiveWeight.div(new Decimal(100)));

      totalViews += views;
      totalBonus = totalBonus.add(bonus);

      detail.push({
        videoId: assignment.video.id,
        videoTitle: assignment.video.title,
        youtubeVideoId: assignment.video.youtubeVideoId,
        role: assignment.role,
        views: Number(views),
        weightPercent: effectiveWeight.toFixed(2),
        bonusPerThousandViews: bonusPerThousandViews.toFixed(4),
        bonus: bonus.toFixed(2),
      });
    }

    return { detail, totalViews, totalBonus };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch approved assignments cho một user
  // ────────────────────────────────────────────────────────────────────────────
  private async getApprovedAssignments(userId: string): Promise<Assignment[]> {
    return db.videoRoleAssignment.findMany({
      where: {
        userId,
        status: "APPROVED",
        video: {
          isActive: true,
          channel: { status: "ACTIVE" },
        },
      },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            youtubeVideoId: true,
            channelId: true,
          },
        },
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Tính lương cho 1 nhân sự — lưu vào DB
  // Sử dụng AnalyticsSnapshot (period views) theo tháng của PayrollPeriod
  // ────────────────────────────────────────────────────────────────────────────
  async calculateForUser(
    userId: string,
    periodId: string
  ): Promise<PayrollRecord> {
    // Lấy period month/year
    const period = await db.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { month: true, year: true },
    });

    // Lấy user info
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, baseSalary: true },
    });

    // Lấy salary config
    const salaryConfig = await this.getActiveSalaryConfig(userId);
    const baseSalary = salaryConfig ? salaryConfig.baseSalary : user.baseSalary;
    const bonusPerThousandViews = salaryConfig
      ? salaryConfig.bonusPerThousandViews
      : new Decimal(0);

    // Lấy assignments
    const assignments = await this.getApprovedAssignments(userId);

    // Tính chi tiết bằng period views (từ AnalyticsSnapshot)
    const { detail, totalViews, totalBonus } = await this.computeDetail(
      assignments,
      bonusPerThousandViews,
      period.month,
      period.year
    );

    const totalSalary = baseSalary.add(totalBonus);
    const now = new Date();

    // Upsert PayrollRecord
    const record = await db.payrollRecord.upsert({
      where: { periodId_userId: { periodId, userId } },
      create: {
        periodId,
        userId,
        baseSalary,
        totalViews,
        totalBonus,
        totalSalary,
        calculatedAt: now,
        detail,
      },
      update: {
        baseSalary,
        totalViews,
        totalBonus,
        totalSalary,
        calculatedAt: now,
        detail,
      },
    });

    return record;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Tính lương toàn bộ nhân sự — upsert từng record
  // ────────────────────────────────────────────────────────────────────────────
  async calculateAll(periodId: string): Promise<PayrollRecord[]> {
    const usersWithAssignments = await db.user.findMany({
      where: {
        videoRoleAssignments: {
          some: {
            status: "APPROVED",
            video: {
              isActive: true,
              channel: { status: "ACTIVE" },
            },
          },
        },
      },
      select: { id: true },
    });

    const results = await Promise.allSettled(
      usersWithAssignments.map((u) => this.calculateForUser(u.id, periodId))
    );

    const records: PayrollRecord[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        records.push(result.value);
      } else {
        console.error("[PayrollCalculator] calculateAll error:", result.reason);
      }
    }

    return records;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Preview lương chưa lưu — dùng cho Staff dashboard
  // Dùng tháng hiện tại làm period
  // ────────────────────────────────────────────────────────────────────────────
  async preview(userId: string, month?: number, year?: number): Promise<PayrollPreview> {
    const now = new Date();
    const m = month ?? now.getMonth() + 1;
    const y = year ?? now.getFullYear();

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, baseSalary: true },
    });

    const salaryConfig = await this.getActiveSalaryConfig(userId);
    const baseSalary = salaryConfig ? salaryConfig.baseSalary : user.baseSalary;
    const bonusPerThousandViews = salaryConfig
      ? salaryConfig.bonusPerThousandViews
      : new Decimal(0);

    const assignments = await this.getApprovedAssignments(userId);

    const { detail, totalViews, totalBonus } = await this.computeDetail(
      assignments,
      bonusPerThousandViews,
      m,
      y
    );

    const totalSalary = baseSalary.add(totalBonus);

    return {
      userId: user.id,
      userName: user.name,
      baseSalary: baseSalary.toFixed(2),
      totalViews: Number(totalViews),
      totalBonus: totalBonus.toFixed(2),
      totalSalary: totalSalary.toFixed(2),
      detail,
    };
  }
}

export const payrollCalculator = new PayrollCalculator();
