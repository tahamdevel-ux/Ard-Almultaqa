import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { tripleNameAr } from "@/server/pilgrims";
import { printOrder, roomLabel } from "@/domain/officeRooms";
import { LINK_COLORS } from "@/domain/links";
import { loadOfficeState } from "./service";
import { loadLinks } from "@/server/links";

/**
 * Internal rooming as the office's own Excel template (src/outputs/templates/office_rooms.xlsx): 16 rooms per sheet, a new sheet for
 * every further 16. Only cell values and styles are written; layout, merges, widths and page setup stay as designed.
 *  - above each room: its label and type, both in the colour of its hotel; the green box under it: the hotel name
 *  - a pilgrim in an «ارتباط» has his name cell tinted with the link colour; the notes area lists the colours
 */
const TYPE_AR: Record<string, string> = { SINGLE: "سنكل", DOUBLE: "ثنائي", TRIPLE: "ثلاثي", QUAD: "رباعي", QUINT: "خماسي", SEXT: "سداسي", SEPT: "سباعي" };
const HOTEL_COLORS: Record<string, string> = { "منارات": "FF0000", "رمادا": "00B050", "انفنتي": "0070C0", "مظلات": "F8CBAD", "نسمات": "A6A6A6", "ملتزم": "FFFF00" };
const SPARE = ["FFC000", "7030A0", "00B0F0", "92D050", "C65911", "FF66CC"];
const CA = ["A", "C", "E", "G", "I", "K"], CB = ["B", "D", "F", "H", "J", "L"];
/**
 * The template has no row above a room for its hotel, so one is inserted above each band (rows 3, 13, 23): the hotel name sits in a cell
 * of its own on top of its room. Everything below an insertion moves down; the legend columns (M..T) stay where they are.
 */
const rr = (n: number) => n + (n >= 3 ? 1 : 0) + (n >= 12 ? 1 : 0) + (n >= 21 ? 1 : 0);
const colNo = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const mapRefs = (t: string) => t.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, d1, col, d2, row) => (colNo(col) >= 13 ? m : `${d1}${col}${d2}${rr(Number(row))}`));
const HOTEL_ROWS = [3, 13, 23];

function insertHotelRows(xml: string): string {
  const sd = /<sheetData>(.*)<\/sheetData>/s.exec(xml)!;
  const rows = new Map<number, { attrs: string; cells: { col: string; xml: string }[] }>();
  for (const m of sd[1].matchAll(/<row ([^>]*?)>(.*?)<\/row>/gs)) {
    const old = Number(/r="(\d+)"/.exec(m[1])![1]);
    const attrs = m[1].replace(/ ?spans="[^"]*"/, "").replace(/r="\d+"/, "");
    for (const c of m[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>.*?<\/c>)/gs)) {
      const home = colNo(c[1]) >= 13 ? old : rr(old); // legend columns stay on their rows
      const row = rows.get(home) ?? { attrs: "", cells: [] };
      rows.set(home, row);
      row.cells.push({ col: c[1], xml: `<c r="${c[1]}${home}"${c[3]}${c[4]}` });
    }
    const home = rr(old); const row = rows.get(home) ?? { attrs: "", cells: [] }; row.attrs = attrs; rows.set(home, row);
  }
  for (const hr of HOTEL_ROWS) {
    const cols = hr === 23 ? "ABCDEFGHIJKL" : "ABCDEFGHIJKL";
    rows.set(hr, { attrs: 'ht="21" customHeight="1" x14ac:dyDescent="0.3"', cells: [...cols].map((col) => ({ col, xml: `<c r="${col}${hr}" s="${hr === 23 && colNo(col) <= 4 ? 1 : 9}"/>` })) });
  }
  const body = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([n, r]) => `<row r="${n}" ${r.attrs.trim()}>${r.cells.sort((a, b) => colNo(a.col) - colNo(b.col)).map((c) => c.xml).join("")}</row>`).join("");
  let out = xml.replace(sd[0], `<sheetData>${body}</sheetData>`);
  // merges: shift, then add one per hotel cell (a pair of columns)
  const merges = [...out.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => mapRefs(m[1]));
  const fixed = merges.filter((r) => !["K10:K11", "L10:L11"].includes(r.replace(/\d+/g, (d) => String(Number(d))))).map((r) => r); // (K/L boxes are merged below as one)
  const add: string[] = [];
  for (const hr of HOTEL_ROWS) for (let c = hr === 23 ? 2 : 0; c < 6; c++) add.push(`${CA[c]}${hr}:${CB[c]}${hr}`);
  const all = [...fixed, ...add];
  out = out.replace(/<mergeCells count="\d+">.*?<\/mergeCells>/s, `<mergeCells count="${all.length}">${all.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>`);
  out = out.replace(/<f>(.*?)<\/f>/g, (_m, f) => `<f>${mapRefs(f)}</f>`);
  out = out.replace(/sqref="([^"]+)"/g, (_m, q) => `sqref="${mapRefs(q)}"`).replace(/<selection [^>]*\/>/, "");
  out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:T${rr(36)}"/>`);
  return out;
}
const BAND_ROWS = [rr(3), rr(12), rr(21)]; // header row of each band; names follow in the next 6 rows, the box for the room's own name 7 rows below
const SLOTS: [number, number][] = BAND_ROWS.flatMap((r, i) => (i < 2 ? [0, 1, 2, 3, 4, 5] : [2, 3, 4, 5]).map((c) => [r, c] as [number, number]));
const PER_SHEET = SLOTS.length;
const NAME_ROWS = 6;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tint = (hex: string, t = 0.72) => { // lighter version of a colour, so black text stays readable
  const n = parseInt(hex, 16), c = (v: number) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0");
  return (c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255)).toUpperCase();
};

/** Style factory on top of the template's styles.xml: clones a cell format with another fill. */
class Styles {
  private fills: string[] = []; private xfs: string[] = []; private fillN = 0; private xfN = 0; private cache = new Map<string, number>(); private fillId = new Map<string, number>();
  constructor(private xml: string) {
    this.fillN = Number(/<fills count="(\d+)"/.exec(xml)![1]);
    const cx = /<cellXfs count="(\d+)">(.*?)<\/cellXfs>/s.exec(xml)!;
    this.xfN = Number(cx[1]);
    this.base = cx[2].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs) ?? [];
  }
  private base: string[];
  withFill(baseId: number, rgb: string, fontId?: number): number {
    const key = `${baseId}:${rgb}:${fontId ?? ""}`;
    const hit = this.cache.get(key); if (hit !== undefined) return hit;
    let fid = this.fillId.get(rgb);
    if (fid === undefined) {
      fid = this.fillN + this.fills.length; this.fillId.set(rgb, fid);
      this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`);
    }
    let x = this.base[baseId] ?? this.base[0];
    x = /fillId="\d+"/.test(x) ? x.replace(/fillId="\d+"/, `fillId="${fid}"`) : x.replace("<xf ", `<xf fillId="${fid}" `);
    x = /applyFill="\d"/.test(x) ? x.replace(/applyFill="\d"/, 'applyFill="1"') : x.replace("<xf ", '<xf applyFill="1" ');
    if (fontId !== undefined) x = /fontId="\d+"/.test(x) ? x.replace(/fontId="\d+"/, `fontId="${fontId}"`) : x.replace("<xf ", `<xf fontId="${fontId}" `);
    const id = this.xfN + this.xfs.length; this.xfs.push(x); this.cache.set(key, id);
    return id;
  }
  toXml(): string {
    return this.xml
      .replace(/<fills count="\d+">(.*?)<\/fills>/s, (_m, inner) => `<fills count="${this.fillN + this.fills.length}">${inner}${this.fills.join("")}</fills>`)
      .replace(/<cellXfs count="\d+">(.*?)<\/cellXfs>/s, (_m, inner) => `<cellXfs count="${this.xfN + this.xfs.length}">${inner}${this.xfs.join("")}</cellXfs>`);
  }
}

class Sheet {
  constructor(public xml: string) {}
  styleOf(ref: string): number {
    const m = new RegExp(`<c r="${ref}"([^>]*?)(/>|>)`).exec(this.xml);
    return Number(/s="(\d+)"/.exec(m?.[1] ?? "")?.[1] ?? 0);
  }
  set(ref: string, v: string | number | null, style?: number, formula?: string) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>.*?</c>)`, "s");
    let m = re.exec(this.xml);
    if (!m) { // a cell the template does not have (a spare list entry): add it at the end of its row
      const rn = /^[A-Z]+(\d+)$/.exec(ref)![1];
      const rm = new RegExp(`<row r="${rn}"[^>]*>.*?</row>`, "s").exec(this.xml);
      if (!rm) throw new Error(`template row ${rn} not found`);
      const colNo = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const mine = colNo(/^[A-Z]+/.exec(ref)![0]);
      const cells = [...rm[0].matchAll(/<c r="([A-Z]+)\d+"/g)];
      const after = cells.find((c) => colNo(c[1]) > mine); // cells of a row must stay in column order
      const row = after ? rm[0].replace(`<c r="${after[1]}${rn}"`, `<c r="${ref}"/><c r="${after[1]}${rn}"`) : rm[0].replace("</row>", `<c r="${ref}"/></row>`);
      this.xml = this.xml.slice(0, rm.index) + row + this.xml.slice(rm.index + rm[0].length);
      m = re.exec(this.xml)!;
    }
    const s = style ?? Number(/s="(\d+)"/.exec(m[1])?.[1] ?? 0);
    const body = formula ? `<f>${esc(formula)}</f><v>${v}</v>` : v === null || v === "" ? "" : typeof v === "number" ? `<v>${v}</v>` : null;
    const cell = formula || typeof v === "number" ? `<c r="${ref}" s="${s}">${body}</c>` : v === null || v === "" ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    this.xml = this.xml.slice(0, m.index) + cell + this.xml.slice(m.index + m[0].length);
  }
}

export async function renderOfficeRoomsTemplateXlsx(tripId: string): Promise<Buffer> {
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } });
  const state = await loadOfficeState(db, tripId);
  const [pilgrims, tripHotels, roomMeta, links] = await Promise.all([
    db.pilgrim.findMany({ where: { id: { in: state.bookings.map((b) => b.pilgrimId) } } }),
    db.tripHotel.findMany({ where: { tripId }, include: { hotel: true } }),
    db.officeRoom.findMany({ where: { tripId }, select: { id: true, note: true } }),
    loadLinks(tripId),
  ]);
  const nameOf = new Map(state.bookings.map((b) => [b.id, tripleNameAr(pilgrims.find((p) => p.id === b.pilgrimId)!)]));
  const hotelName = new Map(tripHotels.map((h) => [h.id, h.hotel.localName ?? h.hotel.officialName]));
  const roomNote = new Map(roomMeta.map((r) => [r.id, r.note ?? ""]));

  // one colour per hotel: the template's own legend colours for its known hotels, spare colours for the others
  const hotelColor = new Map<string, string>(); let spare = 0;
  for (const n of hotelName.values()) if (!hotelColor.has(n)) hotelColor.set(n, HOTEL_COLORS[n.trim()] ?? SPARE[spare++ % SPARE.length]);

  const zip = await JSZip.loadAsync(await readFile(path.join(process.cwd(), "src/outputs/templates/office_rooms.xlsx")));
  const styles = new Styles(await zip.file("xl/styles.xml")!.async("string"));
  const baseSheet = insertHotelRows(await zip.file("xl/worksheets/sheet1.xml")!.async("string"));

  const rooms = printOrder(state.rooms);
  const pages = Math.max(1, Math.ceil(rooms.length / PER_SHEET));
  const sheets: string[] = [];
  const kind = trip.transportType === "AIR" ? "الجو" : "البر";

  for (let p = 0; p < pages; p++) {
    const sh = new Sheet(baseSheet);
    const slice = rooms.slice(p * PER_SHEET, (p + 1) * PER_SHEET);
    const count: Record<string, number> = {}; let people = 0;
    sh.set("A1", `تسكين ${kind} رحلة ${trip.name}${trip.tripNo ? ` (${trip.tripNo})` : ""}${pages > 1 ? ` — ${p + 1}/${pages}` : ""}`);
    // legend of the hotels (colour + name) in R3.., the number of days in R2
    const days = trip.nightsMakkah + trip.nightsMadinah;
    sh.set("R2", days ? `${days + 1} يوم` : "");
    [...hotelColor.entries()].slice(0, 6).forEach(([n, c], i) => sh.set(`R${3 + i}`, n, styles.withFill(sh.styleOf(`R${3 + i}`), c)));
    for (let i = [...hotelColor.keys()].length; i < 6; i++) sh.set(`R${3 + i}`, "", styles.withFill(sh.styleOf(`R${3 + i}`), "FFFFFF"));
    const used = new Map<number, string>(); // link colour index -> its note

    slice.forEach((r, i) => {
      const [r0, c] = SLOTS[i];
      const hn = r.hotelId ? hotelName.get(r.hotelId) ?? "" : "";
      const fill = hn ? hotelColor.get(hn)! : null;
      const type = r.roomType ? TYPE_AR[r.roomType] : `${r.capacity} أسرّة`;
      const head = fill ? (ref: string) => styles.withFill(sh.styleOf(ref), fill) : (ref: string) => sh.styleOf(ref);
      sh.set(`${CA[c]}${r0}`, roomLabel(r), head(`${CA[c]}${r0}`));
      sh.set(`${CB[c]}${r0}`, type, head(`${CB[c]}${r0}`));
      const name = roomNote.get(r.id);
      const members = r.members;
      for (let j = 0; j < NAME_ROWS; j++) {
        const ref = `${CA[c]}${r0 + 1 + j}`;
        // a 7-bed room has one row too few: its last two names share the last row
        const text = members.length > NAME_ROWS && j === NAME_ROWS - 1 ? members.slice(j).map((m) => nameOf.get(m.bookingId)).join(" + ") : members[j] ? nameOf.get(members[j].bookingId) ?? "" : "";
        const lk = members[j] ? links.get(members[j].bookingId) : undefined;
        if (lk) used.set(lk.colorIdx, lk.note ?? "");
        sh.set(ref, text, lk ? styles.withFill(sh.styleOf(ref), tint(LINK_COLORS[lk.colorIdx % LINK_COLORS.length].slice(1))) : undefined);
      }
      // the hotel name sits in a cell of its own above the room, in the hotel's colour; the green box below holds the room's own name
      const href = `${CA[c]}${r0 - 1}`;
      sh.set(href, hn, fill ? styles.withFill(sh.styleOf(href), fill) : undefined);
      const gref = `${CA[c]}${r0 + 7}`;
      if (name) sh.set(gref, name, styles.withFill(sh.styleOf(gref), "C6E0B4", 6));
      count[type] = (count[type] ?? 0) + 1; people += members.length;
    });
    // the statistics panel keeps its formulas; the cached values are written too so every viewer shows the right numbers
    const old = (ref: string, v: string | number, formula?: string) => sh.set(ref.replace(/(\d+)$/, (d) => String(rr(Number(d)))), v, undefined, formula ? mapRefs(formula) : undefined);
    old("A22", slice.length, "COUNTA(L3,J3,H3,F3,D3,B3,B12,D12,F12,H12,J12,L12,L21,J21,H21,F21,D21,B21)");
    old("A23", people, "COUNTA(K4:L9,I4:J9,G4:H9,E4:F9,C4:D9,A4:B9,K13:L18,I13:J18,G13:H18,E13:F18,C13:D18,A13:B18,K22:L27,I22:J27,G22:H27,E22:F27)");
    [["A24", "ثنائي", "T2"], ["A25", "ثلاثي", "T3"], ["A26", "رباعي", "T4"], ["A27", "خماسي", "T5"]].forEach(([ref, t, tc]) => old(ref, count[t] ?? 0, `COUNTIF(A3:L21,${tc})`));
    // the two spare rows of the panel: سداسي and سباعي (and the list of types they are picked from)
    sh.set("T6", "سداسي"); sh.set("T7", "سباعي");
    old("C28", "عدد الغرف السداسية"); old("A28", count["سداسي"] ?? 0, "COUNTIF(A3:L21,T6)");
    old("C29", "عدد الغرف السباعية"); old("A29", count["سباعي"] ?? 0, "COUNTIF(A3:L21,T7)");
    // colours of the «ارتباط» in the notes area
    [...used.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).forEach(([idx, note], i) => {
      const ref = `${CA[i]}${rr(34)}`; // under the notes box (a merged block)
      sh.set(ref, `ارتباط${note ? `: ${note}` : ""}`, styles.withFill(11, tint(LINK_COLORS[idx % LINK_COLORS.length].slice(1), 0.55), 6));
    });
    sh.xml = sh.xml.replace(`<row r="${rr(34)}" `, `<row r="${rr(34)}" ht="21" customHeight="1" `)
      .replace(/sqref="B21 D21"/, 'sqref="B21 D21"')
      .replace(/<formula1>\$T\$1:\$T\$5<\/formula1>/g, "<formula1>$T$1:$T$7</formula1>").replace(/<formula1>\$T\$2:\$T\$5<\/formula1>/g, "<formula1>$T$2:$T$7</formula1>")
      .replace(/<sheetView [^>]*?tabSelected="1"/, (m) => (p === 0 ? m : m.replace(' tabSelected="1"', "")))
;
    // one page per sheet: only the rooms area is printed (not the legend columns), scaled to fit
    sh.xml = sh.xml.replace("<dimension ", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ').replace('fitToHeight="0"', 'fitToWidth="1" fitToHeight="1"');
    sheets.push(sh.xml);
  }

  // the workbook: sheet1 is the template's own sheet; further sheets are copies without the printer-settings relationship
  let wb = await zip.file("xl/workbook.xml")!.async("string");
  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  let types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file("xl/worksheets/sheet1.xml", sheets[0]);
  const sheetTags = [`<sheet name="التسكين 1" sheetId="1" r:id="rId1"/>`];
  for (let p = 1; p < sheets.length; p++) {
    const n = p + 1;
    zip.file(`xl/worksheets/sheet${n}.xml`, sheets[p].replace(/ r:id="rId\d+"/, ""));
    rels = rels.replace("</Relationships>", `<Relationship Id="rIdSheet${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
    types = types.replace("</Types>", `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    sheetTags.push(`<sheet name="التسكين ${n}" sheetId="${n}" r:id="rIdSheet${n}"/>`);
  }
  const sheetNames = sheetTags.map((t) => /name="([^"]+)"/.exec(t)![1]);
  const printAreas = sheetNames.map((n, i) => `<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${pages === 1 ? "التسكين" : n}'!$A$1:$L$${rr(34)}</definedName>`); // down to the row under the notes box, where the «ارتباط» colours are listed
  wb = wb.replace(/<definedNames>.*?<\/definedNames>/s, ""); // the template has none; replaced anyway so a future template cannot clash
  wb = wb.replace(/<sheets>.*?<\/sheets>/s, `<sheets>${sheetTags.join("")}</sheets><definedNames>${printAreas.join("")}</definedNames>`).replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>');
  // the calculation chain would point at cells the copies do not have: Excel rebuilds it
  zip.remove("xl/calcChain.xml");
  rels = rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, "");
  types = types.replace(/<Override [^>]*calcChain[^>]*\/>/, "");
  if (pages === 1) wb = wb.replace(/<sheet name="التسكين 1"/, '<sheet name="التسكين"');
  zip.file("xl/workbook.xml", wb); zip.file("xl/_rels/workbook.xml.rels", rels); zip.file("[Content_Types].xml", types);
  zip.file("xl/styles.xml", styles.toXml());
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
