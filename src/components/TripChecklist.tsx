import Link from "next/link";
import { checklistProgress, type ChecklistStep } from "@/domain/checklist";

/** «خطوات تجهيز الرحلة»: what is done, what is missing, and a button for the next thing to do. */
export function TripChecklist({ steps }: { steps: ChecklistStep[] }) {
  const { done, total, next } = checklistProgress(steps);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <details className="card space-y-3" open={done < total} aria-label="خطوات تجهيز الرحلة">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
        <span className="text-base font-bold">{done === total ? "✓ الرحلة جاهزة" : "خطوات تجهيز الرحلة"}</span>
        <span className="text-sm text-brand-mid">{done} من {total}</span>
        <span className="h-2 w-32 overflow-hidden rounded-full bg-brand-light"><span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></span>
        {next && <Link href={next.href} className="btn btn-sm ms-auto">{next.cta} ←</Link>}
      </summary>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className={"flex items-start gap-3 rounded-xl border p-3 " + (s.done ? "border-emerald-200 bg-emerald-50" : next?.key === s.key ? "border-brand bg-brand-light" : "border-line bg-white")}>
            <span className={"grid h-7 w-7 flex-none place-items-center rounded-full text-sm font-bold " + (s.done ? "bg-emerald-600 text-white" : "bg-white text-brand-dark ring-1 ring-line")}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{s.title}{s.optional && <span className="ms-1 text-xs font-normal text-brand-mid">(اختياري)</span>}</div>
              <div className="text-xs text-brand-mid">{s.detail}</div>
              {!s.done && <Link href={s.href} className="mt-1 inline-block text-xs font-bold text-brand underline">{s.cta}</Link>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
