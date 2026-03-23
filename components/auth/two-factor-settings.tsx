"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff, Loader2, CheckCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "status" | "setup-qr" | "setup-verify" | "disable-confirm" | "success";

interface Props {
  /** Trạng thái 2FA hiện tại của user */
  enabled: boolean;
  /** Callback khi trạng thái thay đổi */
  onEnabledChange?: (enabled: boolean) => void;
  /** Trigger button style: "sidebar" hiển thị nhỏ gọn trong sidebar */
  variant?: "sidebar" | "default";
}

export function TwoFactorSettings({ enabled: initialEnabled, onEnabledChange, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("status");

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [totpCode, setTotpCode] = useState("");

  // Disable state
  const [password, setPassword] = useState("");

  function reset() {
    setStep("status");
    setError(null);
    setQrCode("");
    setSecret("");
    setTotpCode("");
    setPassword("");
  }

  async function startSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa");
      if (!res.ok) throw new Error("Không thể tạo mã QR");
      const data = await res.json();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("setup-qr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndEnable() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code: totpCode.replace(/\s/g, "") }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Mã không đúng"); return; }
      setEnabled(true);
      onEnabledChange?.(true);
      setStep("success");
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Mật khẩu không đúng"); return; }
      setEnabled(false);
      onEnabledChange?.(false);
      setStep("success");
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  const trigger = variant === "sidebar" ? (
    <button
      type="button"
      title={enabled ? "2FA đang bật" : "Bật xác thực 2 lớp"}
      className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
    >
      {enabled
        ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
        : <ShieldOff className="h-4 w-4" />}
      <span>Bảo mật 2FA</span>
      {enabled && (
        <span className="ml-auto text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
          Bật
        </span>
      )}
    </button>
  ) : (
    <Button variant="outline" className="gap-2">
      {enabled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldOff className="h-4 w-4" />}
      {enabled ? "Quản lý 2FA" : "Bật 2FA"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Xác thực 2 lớp (2FA)
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Trạng thái hiện tại */}
        {step === "status" && (
          <div className="space-y-4">
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              enabled ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-200"
            }`}>
              {enabled
                ? <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                : <ShieldOff className="h-5 w-5 text-zinc-400 shrink-0" />}
              <div>
                <p className={`text-sm font-semibold ${enabled ? "text-emerald-700" : "text-zinc-600"}`}>
                  {enabled ? "2FA đang bật" : "2FA chưa bật"}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {enabled
                    ? "Tài khoản được bảo vệ bằng Google Authenticator"
                    : "Bảo vệ tài khoản bằng mã xác thực 6 chữ số khi đăng nhập"}
                </p>
              </div>
            </div>

            {!enabled ? (
              <Button className="w-full" onClick={startSetup} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Bật xác thực 2 lớp
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => { setStep("disable-confirm"); setError(null); }}
              >
                Tắt 2FA
              </Button>
            )}
          </div>
        )}

        {/* Bước 1: Quét QR code */}
        {step === "setup-qr" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Mở ứng dụng <strong>Google Authenticator</strong> (hoặc Authy, 1Password...) và quét mã QR bên dưới.
            </p>

            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="QR code 2FA" className="w-52 h-52 rounded-xl border" />
              </div>
            )}

            {/* Hiện secret thủ công nếu không quét được */}
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                Nhập thủ công thay vì quét QR
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-zinc-100 px-2 py-1 font-mono text-zinc-700 break-all">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(secret)}
                  className="text-zinc-400 hover:text-zinc-700"
                  title="Sao chép"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </details>

            <Button className="w-full" onClick={() => { setStep("setup-verify"); setError(null); }}>
              Đã quét xong →
            </Button>
          </div>
        )}

        {/* Bước 2: Xác nhận mã */}
        {step === "setup-verify" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Nhập mã 6 chữ số từ ứng dụng Authenticator để xác nhận đã thiết lập thành công.
            </p>

            <div className="space-y-1.5">
              <Label>Mã xác thực</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]{6,7}"
                placeholder="000 000"
                maxLength={7}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="text-center text-lg tracking-widest"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep("setup-qr"); setError(null); }} disabled={loading}>
                ← Quay lại
              </Button>
              <Button className="flex-1" onClick={verifyAndEnable} disabled={loading || totpCode.replace(/\s/g, "").length < 6}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Xác nhận & Bật 2FA
              </Button>
            </div>
          </div>
        )}

        {/* Tắt 2FA */}
        {step === "disable-confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Nhập mật khẩu để xác nhận tắt xác thực 2 lớp.
            </p>

            <div className="space-y-1.5">
              <Label>Mật khẩu hiện tại</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep("status"); setError(null); }} disabled={loading}>
                Huỷ
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={disable}
                disabled={loading || !password}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Tắt 2FA
              </Button>
            </div>
          </div>
        )}

        {/* Thành công */}
        {step === "success" && (
          <div className="py-4 text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <p className="font-semibold text-zinc-900">
              {enabled ? "2FA đã được bật thành công!" : "2FA đã được tắt"}
            </p>
            <p className="text-sm text-zinc-500">
              {enabled
                ? "Từ lần đăng nhập tới, bạn sẽ cần nhập mã từ ứng dụng Authenticator."
                : "Tài khoản chỉ cần email và mật khẩu để đăng nhập."}
            </p>
            <Button className="w-full" onClick={() => { setOpen(false); reset(); }}>
              Đóng
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
