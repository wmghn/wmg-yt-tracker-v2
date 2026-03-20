import type { User, Channel, ChannelMember, Video, VideoRoleAssignment, PayrollRecord, PayrollPeriod } from "@prisma/client";

export type UserRole = "DIRECTOR" | "MANAGER" | "STAFF";
export type ChannelStatus = "PENDING_BKT" | "ACTIVE" | "INACTIVE";
export type VideoRole = "WRITER" | "EDITOR";
export type AssignmentStatus = "PENDING" | "APPROVED" | "REJECTED";

// ─── Composite types ──────────────────────────────────────────────────────────

export type UserWithRole = User & {
  role: UserRole;
};

export type ChannelWithMembers = Channel & {
  members: (ChannelMember & {
    user: Pick<User, "id" | "name" | "email" | "role">;
  })[];
  manager: Pick<User, "id" | "name" | "email"> | null;
  _count?: {
    videos: number;
    members: number;
  };
};

export type VideoWithAssignments = Video & {
  channel: Pick<Channel, "id" | "name" | "status">;
  roleAssignments: (VideoRoleAssignment & {
    user: Pick<User, "id" | "name" | "email">;
    approver: Pick<User, "id" | "name"> | null;
  })[];
  submitter: Pick<User, "id" | "name">;
};

export type PayrollSummary = {
  periodId: string;
  month: number;
  year: number;
  isLocked: boolean;
  totalStaff: number;
  totalPayroll: string;
  records: (PayrollRecord & {
    user: Pick<User, "id" | "name" | "email">;
  })[];
};

export type DashboardStats = {
  totalViews: bigint;
  totalRevenue: string | null;
  totalStaff: number;
  pendingApprovals: number;
  viewsChange: number;
  revenueChange: number | null;
};

// ─── API Response types ───────────────────────────────────────────────────────

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

export type ApiError = {
  error: string;
  details?: unknown;
};

// ─── Payroll detail item (stored in JSON) ─────────────────────────────────────

export type PayrollDetailItem = {
  videoId: string;
  videoTitle: string;
  role: VideoRole;
  views: number;
  weightPercent: string;
  bonusPerThousandViews: string;
  bonus: string;
};

// ─── Period with records ──────────────────────────────────────────────────────

export type PeriodWithRecords = PayrollPeriod & {
  records: (PayrollRecord & {
    user: Pick<User, "id" | "name" | "email">;
  })[];
  locker: Pick<User, "id" | "name"> | null;
};
