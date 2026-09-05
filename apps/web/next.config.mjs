/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@buildpilot/domain', '@buildpilot/shared'],
};

export default nextConfig;
