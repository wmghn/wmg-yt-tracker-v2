"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateChannelSchema, type UpdateChannelInput } from "@/lib/validations/channel";

type Manager = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  channelId: string;
  defaultValues: {
    name: string;
    description?: string | null;
    status: string;
    managerId?: string | null;
  };
  managers: Manager[];
  readOnly?: boolean;
};

export function ChannelEditForm({ channelId, defaultValues, managers, readOnly }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<UpdateChannelInput>({
    resolver: zodResolver(updateChannelSchema),
    defaultValues: {
      name: defaultValues.name,
      description: defaultValues.description ?? "",
      status: (defaultValues.status as UpdateChannelInput["status"]) ?? "PENDING_BKT",
      managerId: defaultValues.managerId ?? undefined,
    },
  });

  async function onSubmit(values: UpdateChannelInput) {
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Cập nhật kênh thất bại");
        return;
      }

      toast.success("Cập nhật kênh thành công");
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên kênh</FormLabel>
              <FormControl>
                <Input {...field} disabled={readOnly} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mô tả</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} disabled={readOnly} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trạng thái</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PENDING_BKT">Chờ BKT</SelectItem>
                  <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                  <SelectItem value="INACTIVE">Ngừng</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="managerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manager</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value ?? ""}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Chưa gán manager" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {!readOnly && (
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Lưu thay đổi
          </Button>
        )}
      </form>
    </Form>
  );
}
