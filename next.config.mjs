import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
    ],
  },
  // Ẩn header X-Powered-By: Next.js
  poweredByHeader: false,
  // Không bundle các package Node.js native để tránh lỗi ESM/CJS
  // Next.js 14 dùng experimental.serverComponentsExternalPackages (Next.js 15+ đổi thành serverExternalPackages)
  experimental: {
    serverComponentsExternalPackages: ["otpauth", "qrcode", "better-sqlite3", "@prisma/adapter-better-sqlite3"],
  },
  webpack: (config) => {
    // Khi không dùng SQLite (Netlify/Vercel), thay sqlite-client bằng empty module
    // → webpack không cần resolve ../generated/prisma-sqlite hay better-sqlite3
    if (process.env.DB_PROVIDER !== "sqlite") {
      config.resolve.alias[path.resolve(__dirname, "lib/db/sqlite-client")] = false;
    }
    return config;
  },
};

export default nextConfig;
