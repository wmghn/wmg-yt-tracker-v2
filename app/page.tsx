import Link from "next/link";
import { Youtube, BarChart3, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-red-600">
            <Youtube className="h-5 w-5" />
            <span className="font-bold text-zinc-900">WMG YT View Tracker</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Đăng nhập
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl mb-8">
              <Youtube className="h-7 w-7" />
              <span className="font-bold text-xl">WMG YT View Tracker</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 mb-4">
              Theo dõi lượt xem YouTube & quản lý hiệu suất kênh
            </h1>
            <p className="text-lg text-zinc-500 mb-8">
              Nền tảng nội bộ giúp WMG Media đồng bộ dữ liệu phân tích YouTube,
              theo dõi lượt xem theo video, quản lý nhân sự gắn với kênh và
              tính toán lương dựa trên hiệu suất.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Đăng nhập để bắt đầu
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-white">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center text-xl font-bold text-zinc-900 mb-10">
              Tính năng chính
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-50 text-red-600 mx-auto">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-zinc-900">Phân tích YouTube Analytics</h3>
                <p className="text-sm text-zinc-500">
                  Tự động đồng bộ lượt xem, thời gian xem và doanh thu từ YouTube
                  Analytics API. Dữ liệu được cập nhật định kỳ qua cron job.
                </p>
              </div>
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-50 text-blue-600 mx-auto">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-zinc-900">Quản lý nhân sự & kênh</h3>
                <p className="text-sm text-zinc-500">
                  Quản lý nhiều kênh YouTube, phân quyền nhân sự (Giám đốc,
                  Quản lý, Nhân viên) và theo dõi hiệu suất từng thành viên.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between text-xs text-zinc-400">
          <span>&copy; {new Date().getFullYear()} WMG Media</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-zinc-700">
              Chính sách Bảo mật
            </Link>
            <Link href="/terms" className="hover:text-zinc-700">
              Điều khoản Dịch vụ
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
