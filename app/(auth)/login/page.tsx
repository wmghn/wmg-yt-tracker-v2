"use client";

import { useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Youtube, Loader2, AlertCircle, ShieldCheck } from "lucide-react";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Đang xử lý...
        </>
      ) : (
        label
      )}
    </Button>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  async function handleCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);

    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";

    try {
      // Kiểm tra xem email có bật 2FA không
      const checkRes = await fetch("/api/auth/2fa/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { requires2FA } = await checkRes.json();

      if (requires2FA) {
        // Chuyển sang bước nhập mã 2FA
        setStep("totp");
        setLoading(false);
        setTimeout(() => totpRef.current?.focus(), 100);
        return;
      }

      // Không có 2FA → đăng nhập thẳng
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Email hoặc mật khẩu không đúng");
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setLoading(true);

    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    const totpCode = totpRef.current?.value ?? "";

    try {
      const res = await signIn("credentials", {
        email,
        password,
        totpCode,
        redirect: false,
      });

      if (res?.error) {
        setError("Mã xác thực không đúng hoặc đã hết hạn");
        totpRef.current?.select();
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl">
            <Youtube className="h-6 w-6" />
            <span className="font-bold text-lg">WMG YT View Tracker</span>
          </div>
        </div>
        <CardTitle className="text-2xl">Đăng nhập</CardTitle>
        <CardDescription>
          {step === "totp"
            ? "Nhập mã xác thực từ ứng dụng Authenticator"
            : "Nhập thông tin tài khoản để tiếp tục"}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Bước 1: Email + Mật khẩu */}
        <form
          onSubmit={handleCredentials}
          className={`space-y-4 ${step === "totp" ? "hidden" : ""}`}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              "Đăng nhập"
            )}
          </Button>
        </form>

        {/* Bước 2: Mã 2FA */}
        {step === "totp" && (
          <form onSubmit={handleTotp} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm text-blue-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Tài khoản này đã bật xác thực 2 lớp</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="totpCode">Mã xác thực (6 chữ số)</Label>
              <Input
                ref={totpRef}
                id="totpCode"
                name="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9 ]{6,7}"
                placeholder="000 000"
                required
                autoComplete="one-time-code"
                className="text-center text-lg tracking-widest"
                maxLength={7}
              />
              <p className="text-xs text-zinc-400">
                Mở ứng dụng Google Authenticator hoặc tương đương
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                "Xác nhận"
              )}
            </Button>

            <button
              type="button"
              onClick={() => { setStep("credentials"); setError(undefined); }}
              className="w-full text-center text-sm text-zinc-500 hover:underline"
            >
              ← Quay lại
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
