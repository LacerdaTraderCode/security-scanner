/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@scanner/shared"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};

export default nextConfig;
