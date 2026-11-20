/** Colours of «الارتباط»: distinct from each other and from the room category colours (blue / purple / green). */
export const LINK_COLORS = ["#E11D48", "#EA580C", "#CA8A04", "#0D9488", "#0284C7", "#7C3AED", "#DB2777", "#65A30D", "#475569", "#B45309"] as const;
export const linkColor = (idx: number) => LINK_COLORS[((idx % LINK_COLORS.length) + LINK_COLORS.length) % LINK_COLORS.length];
/** The lowest colour index no link of the trip uses yet (cycles when all are taken). */
export function nextColorIdx(used: number[]): number {
  for (let i = 0; i < LINK_COLORS.length; i++) if (!used.includes(i)) return i;
  return used.length % LINK_COLORS.length;
}
export interface LinkInfo { linkId: string; colorIdx: number; note: string | null; with: string[] }
