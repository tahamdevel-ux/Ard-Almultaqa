export interface MahramSettings {
  enabled: boolean;
  minAge: number;
}
export const DEFAULT_MAHRAM_SETTINGS: MahramSettings = { enabled: false, minAge: 12 };

export interface MahramSubject {
  gender: "MALE" | "FEMALE";
  age: number;
  hasMahram: boolean;
  inCompanionGroup: boolean;
  familyHasAdultMale: boolean;
}

/** Non-blocking. Off by default: women travelling without a mahram is normal for the company. */
export function mahramWarning(p: MahramSubject, s: MahramSettings = DEFAULT_MAHRAM_SETTINGS): string | null {
  if (!s.enabled) return null;
  if (p.gender !== "FEMALE" || p.age < s.minAge) return null;
  if (p.hasMahram || p.inCompanionGroup || p.familyHasAdultMale) return null;
  return "معتمرة بدون محرم مسجّل";
}

export function ageOn(birth: Date, on: Date): number {
  let a = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) a--;
  return a;
}
