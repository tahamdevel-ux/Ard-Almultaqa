import type { ReactNode } from "react";

export function Field({ label, name, error, children, hint }: { label: string; name: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-xs text-brand-mid">{hint}</p>}
      {error && <p className="mt-0.5 text-xs font-bold text-red-700" role="alert">{error}</p>}
    </div>
  );
}
