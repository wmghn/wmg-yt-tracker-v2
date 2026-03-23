

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
  serverExternalPackages: ["otpauth", "qrcode", "better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
