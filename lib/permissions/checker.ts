import { db } from "@/lib/db";
import type { Metric } from "@prisma/client";

export type { Metric };

export async function canViewMetric(userId: string, metric: Metric): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) return false;

  // Director always has access
  if (user.role === "DIRECTOR") return true;

  const config = await db.permissionConfig.findUnique({
    where: { metric },
  });

  if (!config) return false;

  return config.allowedRoles.includes(user.role);
}

export async function getPermissionMatrix() {
  const configs = await db.permissionConfig.findMany();
  return Object.fromEntries(configs.map((c) => [c.metric, c.allowedRoles]));
}
