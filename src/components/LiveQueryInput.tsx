"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A search box for a server-rendered list: the list follows what is typed (after a short pause) by updating the URL parameter,
 * keeping every other filter. Enter still works; the «بحث» button stays for people who like it.
 */
export function LiveQueryInput({ name, defaultValue, ...rest }: { name: string; defaultValue: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue" | "onChange" | "value">) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [v, setV] = useState(defaultValue);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      const t = v.trim();
      if (t) p.set(name, t); else p.delete(name);
      p.delete("saved"); // the «saved» highlight belongs to the page that was just saved
      const qs = p.toString();
      if (qs !== sp.toString()) router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  useEffect(() => { setV(defaultValue); }, [defaultValue]); // «مسح الكل» or a link changed the parameter
  return <input {...rest} name={name} value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />;
}
