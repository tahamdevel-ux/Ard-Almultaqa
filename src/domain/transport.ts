/** How a pilgrim travels. Empty (null) means the trip's default: a bus on land trips, a flight on air trips. */
export type TransportMode = "BUS" | "CAR" | "FLIGHT";
export const TRANSPORT_MODES: TransportMode[] = ["BUS", "CAR", "FLIGHT"];
export const MODE_LABELS: Record<TransportMode, string> = { BUS: "باص", CAR: "سيارة", FLIGHT: "رحلة جوية" };

export const defaultMode = (tripType: "LAND" | "AIR"): TransportMode => (tripType === "LAND" ? "BUS" : "FLIGHT");
export const effectiveMode = (mode: TransportMode | null | undefined, tripType: "LAND" | "AIR"): TransportMode => mode ?? defaultMode(tripType);
export const isMode = (v: unknown): v is TransportMode => typeof v === "string" && (TRANSPORT_MODES as string[]).includes(v);

/** What a seat record says about the pilgrim's transport, for display: «باص 2 / مقعد 14», «سيارة X», «رحلة EP123». */
export function transportText(mode: TransportMode, seat: { bus?: { number: string; name: string | null } | null; seatNo?: number | null; car?: { label: string } | null; flight?: { flightNo: string } | null } | null): string {
  if (mode === "BUS") return seat?.bus ? `باص ${seat.bus.number}${seat.seatNo ? ` / مقعد ${seat.seatNo}` : ""}` : "باص — بلا مقعد";
  if (mode === "CAR") return seat?.car ? `سيارة ${seat.car.label}` : "سيارة — لم تُحدَّد";
  return seat?.flight ? `رحلة ${seat.flight.flightNo}` : "رحلة جوية";
}
