"use client";

import { useEffect, useState } from "react";

export type Metric = "REVENUE" | "VIEWS" | "CPM" | "RPM" | "IMPRESSIONS";

type PermissionMatrix = Record<Metric, string[]>;

let cachedMatrix: PermissionMatrix | null = null;
let fetchPromise: Promise<PermissionMatrix> | null = null;

async function fetchMatrix(): Promise<PermissionMatrix> {
  if (cachedMatrix) return cachedMatrix;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/permissions")
    .then((r) => r.json())
    .then((data) => {
      cachedMatrix = data;
      return data as PermissionMatrix;
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

export function usePermission(metric: Metric, userRole?: string) {
  const [canView, setCanView] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userRole) {
      setLoading(false);
      return;
    }

    fetchMatrix()
      .then((matrix) => {
        const allowed = matrix[metric] ?? [];
        setCanView(allowed.includes(userRole));
      })
      .catch(() => setCanView(false))
      .finally(() => setLoading(false));
  }, [metric, userRole]);

  return { canView, loading };
}
