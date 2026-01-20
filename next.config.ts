import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  images: {
    unoptimized: true,
  },
  // Disable strict mode to prevent double-mounting Canvas and losing WebGL context
  reactStrictMode: false,
  reactCompiler: true,
};

export default nextConfig;
