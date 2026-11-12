import Link from "next/link";

/** «الرحلات › رحلة X › التسكين»: where the user is. The last item has no link. */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="مسار الصفحة" className="flex flex-wrap items-center gap-1 text-xs text-brand-mid">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">›</span>}
          {it.href ? <Link href={it.href} className="underline-offset-2 hover:underline">{it.label}</Link> : <span aria-current="page" className="font-bold text-brand-dark">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
