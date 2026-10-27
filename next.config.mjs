/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["argon2", "sharp", "playwright", "exceljs"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
