"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import {
  Tv2,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Youtube,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: Record<string, NavItem[]> = {
  DIRECTOR: [
    { label: "Quản lý Kênh", href: "/director/channels", icon: <Tv2 className="h-4 w-4" /> },
    { label: "Nhân sự", href: "/director/staff", icon: <Users className="h-4 w-4" /> },
    { label: "Thống kê", href: "/director/analytics", icon: <BarChart3 className="h-4 w-4" /> },
    { label: "Cài đặt", href: "/director/settings", icon: <Settings className="h-4 w-4" /> },
  ],
  MANAGER: [
    { label: "Kênh của tôi", href: "/manager/channels", icon: <Tv2 className="h-4 w-4" /> },
    { label: "Nhân sự", href: "/manager/team", icon: <Users className="h-4 w-4" /> },
    { label: "Analytics", href: "/manager/analytics", icon: <BarChart3 className="h-4 w-4" /> },
  ],
  STAFF: [
    { label: "Analytics", href: "/staff/analytics", icon: <BarChart3 className="h-4 w-4" /> },
  ],
};

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    role: string;
  };
};

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS[user.role] ?? [];
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/users/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTwoFactorEnabled(d.twoFactorEnabled === true))
      .catch(() => {});
  }, []);
  const initials = (user.name ?? user.email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex items-center gap-2 text-red-600">
          <Youtube className="h-6 w-6" />
          <span className="font-bold text-lg text-zinc-900">WMG YT View Tracker</span>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-5 pt-4 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {user.role === "DIRECTOR" ? "Giám đốc" : user.role === "MANAGER" ? "Quản lý" : "Nhân viên"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t p-3 space-y-1">
        <TwoFactorSettings
          enabled={twoFactorEnabled}
          onEnabledChange={setTwoFactorEnabled}
          variant="sidebar"
        />
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-zinc-200 text-zinc-700 text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">{user.name ?? "User"}</p>
            <p className="text-xs text-zinc-400 truncate">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-700"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
