"use client";

import { useState } from "react";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Props {
  userId: string;
  userName: string;
  /** true khi đổi mật khẩu của chính mình → yêu cầu nhập mật khẩu hiện tại */
  isSelf: boolean;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ChangePasswordDialog({ userId, userName, isSelf }: Props) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Mật khẩu mới tối thiểu 6 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = { newPassword };
      if (isSelf) body.currentPassword = currentPassword;

      const res = await fetch(`/api/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Đổi mật khẩu thất bại");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1200);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Đổi mật khẩu"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
        >
          <KeyRound className="h-3.5 w-3.5" />
          Đổi MK
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isSelf ? "Đổi mật khẩu của tôi" : `Đổi mật khẩu — ${userName}`}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center text-sm font-medium text-emerald-600">
            Đổi mật khẩu thành công!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {isSelf && (
              <div className="space-y-1.5">
                <Label>Mật khẩu hiện tại</Label>
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Mật khẩu mới</Label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Tối thiểu 6 ký tự"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Xác nhận mật khẩu mới</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Nhập lại mật khẩu mới"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Lưu mật khẩu
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
