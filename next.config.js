/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ["sharp"]
  }
};
module.exports = nextConfig;
