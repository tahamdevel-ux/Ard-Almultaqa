/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["argon2", "sharp", "playwright-core", "@sparticuz/chromium", "exceljs"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Files read at runtime must be bundled into serverless functions (Vercel).
  outputFileTracingIncludes: {
    "/api/**": ["./public/fonts/*.woff2", "./node_modules/@sparticuz/chromium/bin/**"],
  },
};
