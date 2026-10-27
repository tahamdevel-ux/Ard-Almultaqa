import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "أرض الملتقى - إدارة المعتمرين" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
