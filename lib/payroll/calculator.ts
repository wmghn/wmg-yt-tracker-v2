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

export class PayrollCalculator {
  // Lấy SalaryConfig hiệu lực mới nhất của user (effectiveFrom <= now)
  private async getActiveSalaryConfig(userId: string) {
    return db.salaryConfig.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  // Lấy ChannelWeightConfig hiệu lực mới nhất cho channel+role
  private async getActiveWeightConfig(channelId: string, role: string) {
    return db.channelWeightConfig.findFirst({
      where: {
        channelId,
        role: role as "WRITER" | "EDITOR",
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  // Lấy latest views của video
  private async getLatestViews(videoId: string): Promise<bigint> {
    const log = await db.videoViewsLog.findFirst({
      where: { videoId },
      orderBy: { recordedAt: "desc" },
      select: { viewsCount: true },
    });
    return log?.viewsCount ?? BigInt(0);
  }

  // Tính lương cho 1 nhân sự — lưu vào DB
  async calculateForUser(
    userId: string,
    periodId: string
  ): Promise<PayrollRecord> {
    // Lấy user info
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, baseSalary: true },
    });

    // Lấy salary config
    const salaryConfig = await this.getActiveSalaryConfig(userId);
    const baseSalary = salaryConfig
      ? salaryConfig.baseSalary
      : user.baseSalary;
    const bonusPerThousandViewsDefault = salaryConfig
      ? salaryConfig.bonusPerThousandViews
      : new Decimal(0);

    // Lấy tất cả VideoRoleAssignment status=APPROVED của user
    // Filter: video.isActive=true, channel.status=ACTIVE
    const assignments = await db.videoRoleAssignment.findMany({
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

    const detail: PayrollDetailItem[] = [];
    let totalViews = BigInt(0);
    let totalBonus = new Decimal(0);

    for (const assignment of assignments) {
      const views = await this.getLatestViews(assignment.video.id);
      const weightConfig = await this.getActiveWeightConfig(
        assignment.video.channelId,
        assignment.role
      );

      const weightPercent = weightConfig
        ? weightConfig.weightPercent
        : new Decimal(50);

      // Count how many approved users share the same role for this video
      // to divide the role weight equally among them
      const sameRoleCount = await db.videoRoleAssignment.count({
        where: {
          videoId: assignment.video.id,
          role: assignment.role,
          status: "APPROVED",
        },
      });
      const effectiveWeight = weightPercent.div(new Decimal(Math.max(1, sameRoleCount)));

      // bonus = (views / 1000) * bonusPerThousandViews * (effectiveWeight / 100)
      const viewsDecimal = new Decimal(views.toString());
      const bonus = viewsDecimal
        .div(new Decimal(1000))
        .mul(bonusPerThousandViewsDefault)
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
        bonusPerThousandViews: bonusPerThousandViewsDefault.toFixed(4),
        bonus: bonus.toFixed(2),
      });
    }

    const totalSalary = baseSalary.add(totalBonus);
    const now = new Date();

    // Upsert PayrollRecord (update nếu đã tồn tại cho periodId+userId)
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

  // Tính lương toàn bộ nhân sự — upsert từng record
  async calculateAll(periodId: string): Promise<PayrollRecord[]> {
    // Lấy tất cả users có ít nhất 1 APPROVED assignment trong kênh ACTIVE
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

  // Preview lương chưa lưu — dùng cho Staff dashboard
  async preview(userId: string): Promise<PayrollPreview> {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, baseSalary: true },
    });

    const salaryConfig = await this.getActiveSalaryConfig(userId);
    const baseSalary = salaryConfig
      ? salaryConfig.baseSalary
      : user.baseSalary;
    const bonusPerThousandViewsDefault = salaryConfig
      ? salaryConfig.bonusPerThousandViews
      : new Decimal(0);

    const assignments = await db.videoRoleAssignment.findMany({
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

    const detail: PayrollDetailItem[] = [];
    let totalViews = BigInt(0);
    let totalBonus = new Decimal(0);

    for (const assignment of assignments) {
      const views = await this.getLatestViews(assignment.video.id);
      const weightConfig = await this.getActiveWeightConfig(
        assignment.video.channelId,
        assignment.role
      );

      const weightPercent = weightConfig
        ? weightConfig.weightPercent
        : new Decimal(50);

      // Divide role weight by the number of approved users sharing the same role
      const sameRoleCount = await db.videoRoleAssignment.count({
        where: {
          videoId: assignment.video.id,
          role: assignment.role,
          status: "APPROVED",
        },
      });
      const effectiveWeight = weightPercent.div(new Decimal(Math.max(1, sameRoleCount)));

      const viewsDecimal = new Decimal(views.toString());
      const bonus = viewsDecimal
        .div(new Decimal(1000))
        .mul(bonusPerThousandViewsDefault)
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
        bonusPerThousandViews: bonusPerThousandViewsDefault.toFixed(4),
        bonus: bonus.toFixed(2),
      });
    }

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
