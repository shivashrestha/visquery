/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

const nextConfig = {
  images: {
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '18001',
        pathname: '/api/images/**',
      },
      {
        protocol: 'https',
        hostname: '*.visquery.app',
        pathname: '/api/images/**',
      },
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
