import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/layout/session-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YT Payroll Platform",
  description: "Quản lý kênh YouTube và tính lương theo views",
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
