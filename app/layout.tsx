import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/layout/session-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WMG YT View Tracker",
  description: "Theo dõi lượt xem YouTube, phân tích hiệu suất kênh và quản lý nhân sự",
  verification: {
    google: "6Va8pZjUeQRTVqmtXeSW2M6i1c921ab5tzK1pI9WTZo",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>
          <SessionProvider>{children}</SessionProvider>
        </body>
    </html>
  );
}
