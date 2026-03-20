"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Props = {
  periodId: string;
  periodLabel: string;
};

export function LockButton({ periodId, periodLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLock() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/lock`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Lock kỳ lương thất bại");
        return;
      }

      toast.success(`Đã lock kỳ lương ${periodLabel}`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
      >
        <Lock className="h-3.5 w-3.5 mr-1" />
        Lock kỳ
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận lock kỳ lương</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn lock kỳ lương{" "}
              <strong>{periodLabel}</strong>?{" "}
              <span className="text-red-600 font-medium">
                Sau khi lock không thể tính lại.
              </span>{" "}
              Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleLock}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lock kỳ lương
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
