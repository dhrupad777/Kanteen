import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },

  // Prevent these packages from being bundled - they run as-is in Node.js
  serverExternalPackages: ['firebase-admin', 'web-push'],

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
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'recharts',
      'framer-motion',
      'date-fns',
      'firebase/firestore',
      'firebase/auth',
    ],
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Firebase & Google services
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://fcm.googleapis.com",
              // Service worker
              "worker-src 'self'",
              // Razorpay checkout + Firebase Auth popup iframe
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://apis.google.com",
              "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.firebaseapp.com https://accounts.google.com",
              // Styles (Tailwind inline + Next.js)
              "style-src 'self' 'unsafe-inline'",
              // Images: Firebase Storage, Google profile pictures, placeholder
              "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://placehold.co",
              // Fonts
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
