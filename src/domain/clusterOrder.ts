/**
 * Lists of pilgrims keep family members and room-mates next to each other (not one above and one far below):
 * everyone linked by a family / companion group or by the same office room forms one cluster. Clusters keep the order
 * of their first member; inside a cluster the head of the family comes first, then the original order.
 */
export interface ClusterItem { groupIds: string[]; roomId: string | null; head?: boolean }

export function clusterOrder<T>(items: T[], info: (x: T) => ClusterItem): T[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const seen = new Map<string, number>();
  items.forEach((x, i) => {
    const { groupIds, roomId } = info(x);
    for (const k of [...groupIds.map((g) => "g:" + g), ...(roomId ? ["r:" + roomId] : [])]) {
      const at = seen.get(k);
      if (at === undefined) seen.set(k, i); else union(at, i);
    }
  });
  const first = new Map<number, number>(); // cluster root -> index of its first member
  items.forEach((_, i) => { const r = find(i); if (!first.has(r)) first.set(r, i); });
  return items
    .map((x, i) => ({ x, i, c: first.get(find(i))!, head: info(x).head ? 0 : 1 }))
    .sort((a, b) => a.c - b.c || a.head - b.head || a.i - b.i)
    .map((e) => e.x);
}
