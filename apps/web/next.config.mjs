/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@scanner/shared"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
