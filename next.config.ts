import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },

  // Prevent firebase-admin from being bundled - it needs to run as-is in Node.js
  serverExternalPackages: ['firebase-admin'],

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Compress responses
  compress: true,

  // Optimize production builds
  productionBrowserSourceMaps: false,

  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'recharts'],
  },

  // Security and caching headers
  async headers() {
    return [
      {
        // Static assets - cache for 1 year (immutable)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // HTML pages - no cache (always fresh)
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
