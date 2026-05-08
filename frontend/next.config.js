/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: '*.visquery.app',
        pathname: '/images/**',
      },
    ],
  },
};

module.exports = nextConfig;
