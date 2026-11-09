export interface ReadinessInput {
  bookingActive: boolean;
  passportNo: string | null | undefined;
}

/** "Ready to travel" = the booking is active and the passport number is entered. Nothing else. */
export function readiness(i: ReadinessInput): { ready: boolean } {
  return { ready: i.bookingActive && !!i.passportNo?.trim() };
}
