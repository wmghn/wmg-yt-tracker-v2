"use client";

import { usePermission, type Metric } from "@/hooks/use-permission";
import type { ReactNode } from "react";

type Props = {
  metric: Metric;
  userRole?: string;
  fallback?: ReactNode;
  children: ReactNode;
};

export function PermissionGate({ metric, userRole, fallback = null, children }: Props) {
  const { canView, loading } = usePermission(metric, userRole);

  if (loading) return null;
  if (!canView) return <>{fallback}</>;
  return <>{children}</>;
}
