import { db } from "./db";
import { DEFAULT_MAHRAM_SETTINGS, type MahramSettings } from "@/domain/mahram";

export interface CompanyInfo { name: string; address: string; phones: string }
export const DEFAULT_COMPANY: CompanyInfo = {
  name: "شركة أرض الملتقى للحج والعمرة",
  address: "الموصل - العراق",
  phones: "",
};

const DEFAULTS = {
  company: DEFAULT_COMPANY,
  passportMinMonths: 6,
  mahram: DEFAULT_MAHRAM_SETTINGS,
  maxCompanionGroup: 4,
};
type Defaults = typeof DEFAULTS;

export async function getSetting<K extends keyof Defaults>(key: K): Promise<Defaults[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return DEFAULTS[key];
  const v = row.value as unknown;
  return (typeof DEFAULTS[key] === "object" ? { ...(DEFAULTS[key] as object), ...(v as object) } : v) as Defaults[K];
}
export async function setSetting(key: keyof Defaults, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}
export type { MahramSettings };
