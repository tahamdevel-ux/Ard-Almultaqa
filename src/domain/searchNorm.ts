import { asciiDigits } from "./dateMask";

/** Arabic-insensitive form used for search: no tashkeel/tatweel, alef/ya/ta-marbuta variants merged, ASCII digits, lowercase. */
export function normalizeSearch(raw: string): string {
  return asciiDigits(raw)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(raw: string): string[] {
  return normalizeSearch(raw).split(" ").filter(Boolean).slice(0, 5);
}

/** SQL mirror of normalizeSearch for a text expression (Postgres). Keep in sync with the function above. */
export function sqlNormalize(expr: string): string {
  return `lower(translate(regexp_replace(${expr}, '[ً-ٰٟـ]', '', 'g'), 'أإآٱىئؤة', 'ااااييوه'))`;
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
