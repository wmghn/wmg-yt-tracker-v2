
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
    serverComponentsExternalPackages: ["otpauth", "qrcode", "better-sqlite3", "@prisma/adapter-better-sqlite3", "jose"],
  },
};

export default nextConfig;
