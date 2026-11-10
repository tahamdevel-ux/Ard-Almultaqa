import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ageGroup, orderPeople, rowStyles, type HayaPerson } from "@/domain/haya";

export interface HayaHeader {
  company: string; subCompany: string; transportCompany: string; madinahHotel: string; makkahHotel: string; busNumber: string;
  departureGovernorate: string; departureDate: string; route: string; sequence: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FIRST_ROW = 19, MIN_ROWS = 50, COLS = "BCDEFGHI";

function cell(ref: string, value: string | number | null | undefined, style: number): string {
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === "number") return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

/**
 * Fills the original Hay'a template as a zip: only cell values of xl/worksheets/sheet1.xml change (inline strings, existing style ids
 * kept). Logos, text boxes, fonts, widths, merges and page setup stay byte-for-byte; no spreadsheet library ever re-saves it.
 */
export async function fillHaya(header: HayaHeader, peopleIn: HayaPerson[], departOn: Date | null, templatePath = path.join(process.cwd(), "src/outputs/templates/haya_manifest.xlsx")): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(templatePath));
  let sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

  const setCell = (ref: string, value: string | number | null) => {
    const m = new RegExp(`<c r="${ref}"( s="\\d+")?[^>]*?(/>|>.*?</c>)`, "s").exec(sheet);
    if (!m) throw new Error(`template cell ${ref} not found`);
    const style = /s="(\d+)"/.exec(m[0])?.[1];
    sheet = sheet.slice(0, m.index) + cell(ref, value, style ? Number(style) : 0) + sheet.slice(m.index + m[0].length);
  };

  setCell("D10", header.company);
  setCell("E10", header.subCompany);
  setCell("I10", header.transportCompany);
  setCell("I11", header.madinahHotel);
  setCell("I13", header.makkahHotel);
  setCell("D12", header.busNumber);
  setCell("D14", header.departureGovernorate);
  setCell("D15", header.departureDate);
  setCell("I15", header.route);
  setCell("F12", header.sequence ? `التسلسل / ${header.sequence}` : "التسلسل /");

  const people = orderPeople(peopleIn);
  const contractor = people.find((p) => p.role === "contractor");
  setCell("D11", contractor?.nameAr ?? "");
  setCell("D13", contractor?.phone ?? "");
  const groups = people.map((p) => ageGroup(p.birthDate, departOn));
  setCell("D17", groups.filter((g) => g === "adult").length);
  setCell("E17", groups.filter((g) => g === "child").length || "");
  setCell("F17", groups.filter((g) => g === "infant").length || "");
  setCell("G17", "");
  setCell("H17", people.length);

  const total = Math.max(MIN_ROWS, people.length);
  const rowXml = new Map<number, string>();
  for (let i = 0; i < total; i++) {
    const r = FIRST_ROW + i, p = people[i];
    const [sNo, sBody] = rowStyles(p ? p.role : null);
    const vals = p ? [i + 1, p.nameAr, p.mother, "", p.birth, "", p.passport, p.firstNameEn] : [null, null, null, null, null, null, null, null];
    const cells = [...COLS].map((c, k) => cell(`${c}${r}`, vals[k], k === 0 ? sNo : sBody)).join("");
    rowXml.set(r, cells);
  }
  for (const [r, cells] of rowXml) {
    const re = new RegExp(`(<row r="${r}"[^>]*>)(.*?)(</row>)`, "s");
    const m = re.exec(sheet);
    if (m) sheet = sheet.slice(0, m.index) + m[1] + cells + m[3] + sheet.slice(m.index + m[0].length);
    else {
      // a row the template does not have (past its last people row): copy row 68's attributes, keep rows in order
      const attrs = /<row r="68"([^>]*)>/.exec(sheet)![1];
      const html = `<row r="${r}"${attrs}>${cells}</row>`;
      const next = [...sheet.matchAll(/<row r="(\d+)"/g)].map((x) => ({ n: Number(x[1]), at: x.index! })).find((x) => x.n > r);
      const at = next ? next.at : sheet.indexOf("</sheetData>");
      sheet = sheet.slice(0, at) + html + sheet.slice(at);
    }
  }
  const last = Math.max(101, FIRST_ROW + total - 1);
  sheet = sheet.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="B6:K${last}"/>`);

  zip.file("xl/worksheets/sheet1.xml", sheet, { createFolders: false });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
