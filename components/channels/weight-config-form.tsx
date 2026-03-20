"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { weightConfigSchema, type WeightConfigInput } from "@/lib/validations/channel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  channelId: string;
  initialWriter?: number;
  initialEditor?: number;
  onSuccess?: () => void;
};

export function WeightConfigForm({ channelId, initialWriter = 50, initialEditor = 50, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const form = useForm<WeightConfigInput>({
    resolver: zodResolver(weightConfigSchema),
    defaultValues: {
      configs: [
        { role: "WRITER", weightPercent: initialWriter },
        { role: "EDITOR", weightPercent: initialEditor },
      ],
    },
  });

  const writerValue = form.watch("configs.0.weightPercent");
  const editorValue = form.watch("configs.1.weightPercent");
  const total = (Number(writerValue) || 0) + (Number(editorValue) || 0);
  const isValid = total === 100;

  async function onSubmit(values: WeightConfigInput) {
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Cập nhật tỉ trọng thất bại");
        return;
      }

      toast.success("Đã cập nhật tỉ trọng thành công");
      onSuccess?.();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cấu hình tỉ trọng</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="configs.0.weightPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Biên kịch (Writer) %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="50"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="configs.1.weightPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dựng phim (Editor) %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="50"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className={`text-sm font-medium ${isValid ? "text-green-600" : "text-red-500"}`}>
              Tổng: {total}% {isValid ? "(hợp lệ)" : "(phải bằng 100%)"}
            </div>

            <Button type="submit" disabled={loading || !isValid}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lưu tỉ trọng
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
