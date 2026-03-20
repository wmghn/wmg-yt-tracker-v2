"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  videoId: string;
  assignmentId: string;
  currentStatus: "PENDING" | "APPROVED" | "REJECTED";
};

export function ApproveButton({ videoId, assignmentId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setLoading(action);
    try {
      const res = await fetch(`/api/videos/${videoId}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: [{ assignmentId, action }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Thao tác thất bại");
        return;
      }

      toast.success(action === "approve" ? "Đã duyệt phân công" : "Đã từ chối phân công");
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(null);
    }
  }

  if (currentStatus !== "PENDING") {
    return null;
  }

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
        onClick={() => handleAction("approve")}
        disabled={loading !== null}
      >
        {loading === "approve" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        <span className="ml-1">Duyệt</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        onClick={() => handleAction("reject")}
        disabled={loading !== null}
      >
        {loading === "reject" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
        <span className="ml-1">Từ chối</span>
      </Button>
    </div>
  );
}
