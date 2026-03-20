"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, RefreshCw, Plus, Loader2, UserCheck, ToggleLeft, ToggleRight } from "lucide-react";
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

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "MANAGER" | "STAFF";
  isActive: boolean;
  createdAt: string;
}

// ─── Add Staff Dialog ──────────────────────────────────────────────────────────

function AddStaffDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(""); setEmail(""); setPassword(""); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: "STAFF" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Lỗi tạo tài khoản"); return; }
      setOpen(false);
      reset();
      onCreated();
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Thêm nhân sự
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm nhân sự mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Họ tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" required />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nva@company.com" required />
          </div>
          <div className="space-y-1.5">
            <Label>Mật khẩu</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" minLength={6} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Huỷ</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tạo tài khoản
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ManagerTeamPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const json = await res.json();
      setUsers((json.users ?? []).filter((u: StaffUser) => u.role === "STAFF"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleToggleActive(userId: string, current: boolean) {
    setUpdating(userId);
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !current } : u));
    setUpdating(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Nhân sự</h1>
        </div>
        <AddStaffDialog onCreated={fetchUsers} />
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <UserCheck className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-zinc-900">Nhân viên</h2>
            <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{users.length}</span>
          </div>

          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Chưa có nhân viên nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-zinc-50">
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Tên</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Email</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Trạng thái</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-zinc-50/50">
                      <td className="px-5 py-3 font-medium text-zinc-900">{u.name}</td>
                      <td className="px-5 py-3 text-zinc-500">{u.email}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleToggleActive(u.id, u.isActive)}
                          disabled={updating === u.id}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          {updating === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                          ) : u.isActive ? (
                            <>
                              <ToggleRight className="h-5 w-5 text-emerald-500" />
                              <span className="text-emerald-600 font-medium">Hoạt động</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="h-5 w-5 text-zinc-400" />
                              <span className="text-zinc-400">Vô hiệu</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
