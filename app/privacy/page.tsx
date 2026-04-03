import type { Metadata } from "next";
import Link from "next/link";
import { Youtube, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách Bảo mật – WMG YT View Tracker",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <Link href="/login" className="flex items-center gap-2 text-red-600">
            <Youtube className="h-5 w-5" />
            <span className="font-bold text-zinc-900">WMG YT View Tracker</span>
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Đăng nhập
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Chính sách Bảo mật
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Cập nhật lần cuối: 03/04/2026
        </p>

        <div className="prose prose-zinc max-w-none space-y-6 text-sm leading-relaxed text-zinc-700">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              1. Giới thiệu
            </h2>
            <p>
              WMG YT View Tracker (&quot;Nền tảng&quot;) được vận hành bởi WMG
              Media. Chúng tôi cam kết bảo vệ quyền riêng tư của bạn. Chính
              sách này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ
              thông tin cá nhân khi bạn sử dụng Nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              2. Thông tin chúng tôi thu thập
            </h2>
            <p>
              <strong>Thông tin tài khoản:</strong> Khi bạn đăng ký, chúng tôi
              thu thập họ tên, địa chỉ email và mật khẩu (được mã hoá).
            </p>
            <p>
              <strong>Dữ liệu YouTube:</strong> Khi bạn kết nối kênh YouTube,
              chúng tôi truy cập dữ liệu phân tích (lượt xem, thời gian xem)
              thông qua YouTube Analytics API. Chúng tôi chỉ đọc dữ liệu phân
              tích và không chỉnh sửa kênh hoặc video của bạn.
            </p>
            <p>
              <strong>Token OAuth:</strong> Access token và refresh token từ
              Google được mã hoá bằng AES-256-GCM trước khi lưu trữ trong cơ sở
              dữ liệu. Chúng tôi không bao giờ lưu token ở dạng văn bản thuần.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              3. Cách chúng tôi sử dụng thông tin
            </h2>
            <p>Thông tin của bạn được sử dụng để:</p>
            <p>
              — Xác thực và quản lý tài khoản của bạn trên Nền tảng.
              <br />
              — Đồng bộ dữ liệu phân tích YouTube để tính toán báo cáo và
              lương.
              <br />
              — Hiển thị thống kê lượt xem, thời gian xem theo kênh và video.
              <br />— Cải thiện hiệu suất và bảo mật của Nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              4. Chia sẻ thông tin
            </h2>
            <p>
              Chúng tôi <strong>không</strong> bán, cho thuê hoặc chia sẻ thông
              tin cá nhân của bạn với bên thứ ba, ngoại trừ:
            </p>
            <p>
              — <strong>Google APIs:</strong> Để lấy dữ liệu phân tích YouTube
              theo uỷ quyền của bạn.
              <br />— <strong>Yêu cầu pháp lý:</strong> Khi có yêu cầu từ cơ
              quan có thẩm quyền theo quy định pháp luật.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              5. Tuân thủ Google API Services User Data Policy
            </h2>
            <p>
              Việc sử dụng và chuyển giao thông tin nhận được từ Google APIs tuân
              thủ{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , bao gồm các yêu cầu về Limited Use (Sử dụng Hạn chế).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              6. Bảo mật dữ liệu
            </h2>
            <p>
              Chúng tôi áp dụng các biện pháp bảo mật bao gồm: mã hoá token
              bằng AES-256-GCM, xác thực hai lớp (2FA), HTTPS bắt buộc, và các
              security headers (HSTS, CSP, X-Frame-Options). Mật khẩu được băm
              (hash) và không thể khôi phục.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              7. Quyền của bạn
            </h2>
            <p>Bạn có quyền:</p>
            <p>
              — Ngắt kết nối kênh YouTube bất kỳ lúc nào (token sẽ bị thu hồi
              tại Google và xoá khỏi hệ thống).
              <br />
              — Yêu cầu xoá tài khoản và toàn bộ dữ liệu liên quan.
              <br />— Thu hồi quyền truy cập của Nền tảng qua{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                cài đặt bảo mật Google
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              8. Lưu trữ dữ liệu
            </h2>
            <p>
              Dữ liệu phân tích được lưu trữ trên hệ thống cơ sở dữ liệu bảo
              mật. Khi bạn ngắt kết nối kênh, token OAuth sẽ bị xoá ngay lập
              tức. Dữ liệu phân tích lịch sử có thể được giữ lại phục vụ báo
              cáo nội bộ trừ khi bạn yêu cầu xoá.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              9. Liên hệ
            </h2>
            <p>
              Nếu bạn có câu hỏi về chính sách bảo mật, vui lòng liên hệ qua
              email:{" "}
              <a
                href="mailto:nguyendttnyt@gmail.com"
                className="text-blue-600 hover:underline"
              >
                nguyendttnyt@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between text-xs text-zinc-400">
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
