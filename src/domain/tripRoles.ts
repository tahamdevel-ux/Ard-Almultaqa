export type TripRole = "CONTRACTOR" | "DRIVER" | "ASSISTANT";

export const TRIP_ROLE_LABELS: Record<TripRole, string> = { CONTRACTOR: "متعهد", DRIVER: "سايق", ASSISTANT: "مساعد سايق" };
export const isTripRole = (v: unknown): v is TripRole => v === "CONTRACTOR" || v === "DRIVER" || v === "ASSISTANT";

export interface RoleHolder { bookingId: string; role: TripRole | null; busId: string | null }

/**
 * Per bus there is at most one contractor, one driver and one assistant. Returns the Arabic message when `candidate` (placed on
 * `busId`) would be a second holder of the same role on that bus, else null. People without a bus (air trips) are unrestricted.
 */
export function roleConflict(holders: RoleHolder[], candidate: { bookingId: string; role: TripRole | null; busId: string | null }): string | null {
  if (!candidate.role || !candidate.busId) return null;
  const other = holders.find((h) => h.bookingId !== candidate.bookingId && h.busId === candidate.busId && h.role === candidate.role);
  return other ? `يوجد ${TRIP_ROLE_LABELS[candidate.role]} في هذا الباص مسبقاً — لكل باص ${TRIP_ROLE_LABELS[candidate.role]} واحد فقط` : null;
}

/** Sort key for the Hay'a manifest: contractor, driver, assistant, then everyone else. */
export const roleOrder = (r: TripRole | null) => (r === "CONTRACTOR" ? 0 : r === "DRIVER" ? 1 : r === "ASSISTANT" ? 2 : 3);
