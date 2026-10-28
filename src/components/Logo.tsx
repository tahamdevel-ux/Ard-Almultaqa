/* eslint-disable @next/next/no-img-element */
export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <img src="/brand/logo-192.png" width={size} height={size} alt="شعار شركة أرض الملتقى" className={className} />;
}
