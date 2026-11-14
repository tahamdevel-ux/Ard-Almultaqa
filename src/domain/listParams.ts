/** URL parameters of the pilgrims list: whitelisted so nothing unexpected reaches a query. */
export const FILTERS = ["expiring", "noroom", "noprice"] as const;
export type PilgrimFilter = (typeof FILTERS)[number];
export const SORTS = ["new", "name", "passport", "expiry"] as const;
export type PilgrimSort = (typeof SORTS)[number];

export interface ListParams { q: string; room: string; f: PilgrimFilter | ""; trip: string; agent: string; sort: PilgrimSort; dir: "asc" | "desc" }

const ID = /^[0-9a-f-]{36}$/;

export function parseListParams(raw: Record<string, string | undefined>): ListParams {
  const f = (FILTERS as readonly string[]).includes(raw.f ?? "") ? (raw.f as PilgrimFilter) : "";
  const sort = (SORTS as readonly string[]).includes(raw.sort ?? "") ? (raw.sort as PilgrimSort) : "new";
  return {
    q: (raw.q ?? "").replace(/\0/g, "").slice(0, 100), room: (raw.room ?? "").replace(/\0/g, "").slice(0, 10), f, sort,
    dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : sort === "new" ? "desc" : "asc",
    trip: ID.test(raw.trip ?? "") ? raw.trip! : "", agent: ID.test(raw.agent ?? "") ? raw.agent! : "",
  };
}

/** Query string for a list state; empty values are left out so URLs stay short and shareable. */
export function listQuery(p: Partial<ListParams>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, String(v));
  return u.toString();
}

/** Clicking a column: the same column flips the direction, another column starts ascending (newest-first for «new»). */
export function nextSort(cur: ListParams, col: PilgrimSort): { sort: PilgrimSort; dir: "asc" | "desc" } {
  if (cur.sort === col) return { sort: col, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { sort: col, dir: col === "new" ? "desc" : "asc" };
}
