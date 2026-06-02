/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

const nextConfig = {
  images: {
    // Images are content-addressed (SHA256 ETag), safe to cache for a year
    minimumCacheTTL: 31536000,
    // Allow WebP/AVIF conversion and auto-sizing
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Direct backend (dev + Next.js internal fetch via rewrite)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '18001',
        pathname: '/api/images/**',
      },
      // Production
      {
        protocol: 'https',
        hostname: '*.visquery.app',
        pathname: '/api/images/**',
      },
      // Any other configured backend host
      ...(process.env.BACKEND_HOSTNAME
        ? [
            {
              protocol: process.env.BACKEND_PROTOCOL ?? 'https',
              hostname: process.env.BACKEND_HOSTNAME,
              pathname: '/api/images/**',
            },
          ]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: '/images/:path*',
        destination: `${BACKEND_URL}/api/images/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
