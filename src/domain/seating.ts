/** Standard 2+2 bus: seats 1..4 are row 1, 5..8 row 2, etc. */
export const SEATS_PER_ROW = 4;

export function seatRow(seatNo: number): number {
  return Math.ceil(seatNo / SEATS_PER_ROW);
}

export function validateSeat(
  seatNo: number,
  seatCount: number,
  occupied: Map<number, string>,
  bookingId: string,
): string | null {
  if (!Number.isInteger(seatNo) || seatNo < 1 || seatNo > seatCount) return "رقم المقعد غير صحيح";
  const holder = occupied.get(seatNo);
  if (holder && holder !== bookingId) return "المقعد محجوز لمعتمر آخر";
  return null;
}

export interface SeatGroup { id: string; bookingIds: string[] }

/**
 * Greedy auto-seat. Groups (family / companions) are placed together first, in consecutive
 * seats, then singles fill the remaining seats. Returns bookingId -> seatNo; unseated
 * bookings are absent when the bus is full.
 */
export function autoSeat(
  seatCount: number,
  occupied: Map<number, string>,
  toSeat: { bookingId: string; groupId?: string | null }[],
): Map<string, number> {
  const result = new Map<string, number>();
  const taken = new Set(occupied.keys());
  const groups = new Map<string, string[]>();
  const singles: string[] = [];
  for (const t of toSeat) {
    if (t.groupId) {
      const g = groups.get(t.groupId) ?? [];
      g.push(t.bookingId);
      groups.set(t.groupId, g);
    } else singles.push(t.bookingId);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const members of ordered) {
    if (members.length === 1) { singles.push(members[0]); continue; }
    const start = findRun(seatCount, taken, members.length);
    if (start == null) { singles.push(...members); continue; }
    members.forEach((id, i) => { result.set(id, start + i); taken.add(start + i); });
  }
  for (const id of singles) {
    let s = 1;
    while (s <= seatCount && taken.has(s)) s++;
    if (s > seatCount) break;
    result.set(id, s); taken.add(s);
  }
  return result;
}

/** First run of n free consecutive seats within one row if possible, else any consecutive run. */
function findRun(seatCount: number, taken: Set<number>, n: number): number | null {
  for (const sameRow of [true, false]) {
    for (let s = 1; s + n - 1 <= seatCount; s++) {
      let ok = true;
      for (let k = 0; k < n; k++) if (taken.has(s + k)) { ok = false; break; }
      if (!ok) continue;
      if (sameRow && seatRow(s) !== seatRow(s + n - 1)) continue;
      return s;
    }
  }
  return null;
}

/** Warn about group members who are not in consecutive rows. */
export function nonAdjacentGroups(seats: Map<string, number>, groups: SeatGroup[]): string[] {
  const bad: string[] = [];
  for (const g of groups) {
    const rows = g.bookingIds.map((b) => seats.get(b)).filter((x): x is number => x != null).map(seatRow);
    if (rows.length > 1 && Math.max(...rows) - Math.min(...rows) > 1) bad.push(g.id);
  }
  return bad;
}
