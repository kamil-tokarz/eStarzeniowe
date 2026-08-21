import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["**.app.github.dev", "*.app.github.dev", "localhost:3000"],
    },
  },
};

export default nextConfig;
