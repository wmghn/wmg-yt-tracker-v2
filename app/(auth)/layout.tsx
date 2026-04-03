import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>
      <footer className="py-4 text-center text-xs text-zinc-400 space-x-4">
        <Link href="/privacy" className="hover:text-zinc-600 transition-colors">
          Chính sách Bảo mật
        </Link>
        <span>·</span>
        <Link href="/terms" className="hover:text-zinc-600 transition-colors">
          Điều khoản Dịch vụ
        </Link>
      </footer>
    </div>
  );
}
