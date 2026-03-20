"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Calculator } from "lucide-react";
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

export function CalculateButton({ periodId, periodLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCalculate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/calculate`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Tính lương thất bại");
        return;
      }

      toast.success(
        `Đã tính lương cho ${data.calculated} nhân sự. Tổng: ${Number(data.totalPayroll).toLocaleString("vi-VN")} đ`
      );
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
        className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Calculator className="h-3.5 w-3.5 mr-1" />
        Tính lương
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận tính lương</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn tính lương cho kỳ{" "}
              <strong>{periodLabel}</strong>? Thao tác này sẽ tính toán và lưu
              lương cho tất cả nhân sự có assignment được duyệt.
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
            <Button onClick={handleCalculate} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tính lương
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
