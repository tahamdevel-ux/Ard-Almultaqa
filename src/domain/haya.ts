/** Pure rules of the Hay'a land manifest: row order, role colours and age groups. */
export type HayaRole = "contractor" | "driver" | "assistant" | "pilgrim";
export interface HayaPerson { role: HayaRole; nameAr: string; mother: string; birth: string; passport: string; firstNameEn: string; phone?: string | null; birthDate?: Date | null }

const ORDER: Record<HayaRole, number> = { contractor: 0, driver: 1, assistant: 2, pilgrim: 3 };

/** Contractor first, then driver, then the driver's assistant, then pilgrims in the order given. A missing role simply lets the next person move up. */
export function orderPeople<T extends { role: HayaRole }>(people: T[]): T[] {
  return people.map((p, i) => ({ p, i })).sort((a, b) => ORDER[a.p.role] - ORDER[b.p.role] || a.i - b.i).map((x) => x.p);
}

/** Style ids of the template: [number cell, other cells]. Contractor green (24), driver and assistant orange (25), pilgrims 22. */
export function rowStyles(role: HayaRole | null): [number, number] {
  if (role === "contractor") return [20, 24];
  if (role === "driver" || role === "assistant") return [21, 25];
  return [22, 22];
}

export function ageGroup(birth: Date | null | undefined, on: Date | null): "adult" | "child" | "infant" {
  if (!birth || !on) return "adult";
  const years = (on.getTime() - birth.getTime()) / (365.25 * 86400000);
  return years < 2 ? "infant" : years < 12 ? "child" : "adult";
}
