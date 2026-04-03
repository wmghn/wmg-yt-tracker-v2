import type { Metadata } from "next";
import Link from "next/link";
import { Youtube, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Điều khoản Dịch vụ – YT Payroll Platform",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <Link href="/login" className="flex items-center gap-2 text-red-600">
            <Youtube className="h-5 w-5" />
            <span className="font-bold text-zinc-900">YT Payroll</span>
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
          Điều khoản Dịch vụ
        </h1>
        <p className="text-sm text-zinc-400 mb-8">
          Cập nhật lần cuối: 03/04/2026
        </p>

        <div className="prose prose-zinc max-w-none space-y-6 text-sm leading-relaxed text-zinc-700">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              1. Chấp nhận Điều khoản
            </h2>
            <p>
              Bằng việc truy cập và sử dụng YT Payroll Platform
              (&quot;Nền tảng&quot;), bạn đồng ý tuân thủ các điều khoản dịch
              vụ này. Nếu bạn không đồng ý, vui lòng không sử dụng Nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              2. Mô tả Dịch vụ
            </h2>
            <p>
              Nền tảng cung cấp công cụ quản lý kênh YouTube nội bộ, bao gồm:
              đồng bộ dữ liệu phân tích YouTube (lượt xem, thời gian xem),
              quản lý nhân sự gắn với kênh, và tính toán lương dựa trên hiệu
              suất. Nền tảng hoạt động dưới dạng công cụ nội bộ cho tổ chức của
              bạn.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              3. Tài khoản Người dùng
            </h2>
            <p>
              Tài khoản được tạo bởi quản trị viên (Director) của tổ chức. Bạn
              có trách nhiệm bảo mật thông tin đăng nhập. Nếu phát hiện truy
              cập trái phép, hãy thông báo ngay cho quản trị viên. Chúng tôi
              khuyến khích bật xác thực hai lớp (2FA) để tăng cường bảo mật.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              4. Kết nối YouTube
            </h2>
            <p>
              Khi kết nối kênh YouTube, bạn uỷ quyền cho Nền tảng truy cập dữ
              liệu phân tích qua YouTube Analytics API và YouTube Data API.
              Chúng tôi chỉ yêu cầu quyền đọc (read-only) và không thực hiện
              bất kỳ thay đổi nào trên kênh YouTube của bạn. Bạn có thể thu hồi
              quyền này bất kỳ lúc nào thông qua cài đặt kênh hoặc trang quản
              lý quyền của Google.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              5. Sử dụng hợp lệ
            </h2>
            <p>Khi sử dụng Nền tảng, bạn cam kết:</p>
            <p>
              — Không chia sẻ thông tin đăng nhập cho người khác.
              <br />
              — Không cố gắng truy cập trái phép vào dữ liệu của kênh hoặc
              người dùng khác.
              <br />
              — Không sử dụng Nền tảng cho mục đích vi phạm pháp luật.
              <br />— Không can thiệp, phá hoại hoặc gây gián đoạn hoạt động
              của Nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              6. Quyền Sở hữu Trí tuệ
            </h2>
            <p>
              Nền tảng và toàn bộ nội dung, giao diện, mã nguồn thuộc sở hữu
              của WMG Media. Dữ liệu YouTube thuộc về Google và chủ sở hữu kênh
              tương ứng. Bạn giữ quyền sở hữu đối với dữ liệu mà bạn cung cấp
              cho Nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              7. Giới hạn Trách nhiệm
            </h2>
            <p>
              Nền tảng được cung cấp &quot;nguyên trạng&quot; (as-is). Chúng tôi
              nỗ lực đảm bảo tính chính xác của dữ liệu phân tích nhưng không
              đảm bảo dữ liệu luôn hoàn toàn chính xác hoặc cập nhật theo thời
              gian thực. Chúng tôi không chịu trách nhiệm cho các thiệt hại phát
              sinh từ việc sử dụng hoặc không thể sử dụng Nền tảng, bao gồm
              nhưng không giới hạn: gián đoạn dịch vụ, mất dữ liệu, hoặc sai
              sót trong tính toán.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              8. Chấm dứt
            </h2>
            <p>
              Quản trị viên có thể vô hiệu hoá tài khoản của bạn bất kỳ lúc
              nào. Khi tài khoản bị chấm dứt, quyền truy cập Nền tảng sẽ bị
              thu hồi. Dữ liệu phân tích lịch sử có thể được giữ lại phục vụ
              mục đích báo cáo nội bộ.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              9. Thay đổi Điều khoản
            </h2>
            <p>
              Chúng tôi có thể cập nhật Điều khoản Dịch vụ này theo thời gian.
              Các thay đổi sẽ có hiệu lực ngay khi được đăng tải trên Nền tảng.
              Việc tiếp tục sử dụng Nền tảng sau khi thay đổi đồng nghĩa với
              việc bạn chấp nhận các điều khoản mới.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              10. Liên hệ
            </h2>
            <p>
              Mọi thắc mắc về Điều khoản Dịch vụ, vui lòng liên hệ:{" "}
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
