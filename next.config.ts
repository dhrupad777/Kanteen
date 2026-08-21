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
        // Page HTML — must not be cached for a year.
        //
        // App Router prerendered pages default to `s-maxage=31536000`, and the
        // Firebase Hosting CDN honours it. Because a `--only apphosting` deploy
        // does not purge that CDN, users kept being served old HTML pointing at
        // chunk files the new build had deleted — a ChunkLoadError on every
        // deploy. Firebase's own `headers` rules cannot fix this: they do not
        // override Cache-Control on responses proxied to Cloud Run, so it has to
        // be set here at the origin.
        //
        // Listed explicitly rather than `/:path*` so the immutable rule for
        // /_next/static above is left alone.
        source: '/:path(|student|counter|kitchen|report|cart|order|staff-login|feedback)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=60, must-revalidate' },
        ],
      },
      {
        // Security headers for every route
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Required for Firebase Google sign-in popup (window.closed checks)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Firebase & Google services + analytics + Meta Pixel
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://fcm.googleapis.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://api.razorpay.com https://lumberjack.razorpay.com https://www.facebook.com https://connect.facebook.net",
              // Service worker
              "worker-src 'self'",
              // Razorpay + Firebase Auth + GTM + Analytics + Meta Pixel
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://connect.facebook.net",
              "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.firebaseapp.com https://accounts.google.com",
              // Styles (Tailwind inline + Next.js + Google Fonts)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Images: Firebase Storage, Google profile pictures, placeholder, Meta Pixel
              "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://placehold.co https://www.google-analytics.com https://www.facebook.com https://connect.facebook.net",
              // Fonts: local + Google Fonts CDN
              "font-src 'self' https://fonts.gstatic.com",
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
