/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow your phone's IP address to download the Next.js client bundles
  allowedDevOrigins: ['192.168.254.107'],
}

export default nextConfig