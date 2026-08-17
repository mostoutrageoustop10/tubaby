/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js', 'sharp']
  },
  typescript: {
    ignoreBuildErrors: true
  }
};
module.exports = nextConfig;
