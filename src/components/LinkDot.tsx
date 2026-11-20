import { linkColor } from "@/domain/links";

/** The colour dot of an «ارتباط»: same colour = related pilgrims. Hover (or long-press) names the others. */
export function LinkDot({ colorIdx, note, withNames }: { colorIdx: number; note?: string | null; withNames: string[] }) {
  const c = linkColor(colorIdx);
  const title = `ارتباط${note ? ` (${note})` : ""} مع: ${withNames.join("، ")}`;
  return <span role="img" aria-label={title} title={title} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: c }}><span aria-hidden="true">🔗</span>{note ?? "ارتباط"}</span>;
}
