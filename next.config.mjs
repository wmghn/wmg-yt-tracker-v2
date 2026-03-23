

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
  serverExternalPackages: ["otpauth", "qrcode"],
};

export default nextConfig;
