"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "./action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Youtube, Loader2, AlertCircle } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Đang đăng nhập...
        </>
      ) : (
        "Đăng nhập"
      )}
    </Button>
  );
}

export default function LoginPage() {
  const [error, dispatch] = useFormState(loginAction, undefined);

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl">
            <Youtube className="h-6 w-6" />
            <span className="font-bold text-lg">YT Payroll</span>
          </div>
        </div>
        <CardTitle className="text-2xl">Đăng nhập</CardTitle>
        <CardDescription>Nhập thông tin tài khoản để tiếp tục</CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        <form action={dispatch} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
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
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
