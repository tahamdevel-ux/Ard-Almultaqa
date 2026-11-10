import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { tripleNameAr } from "@/server/pilgrims";
import { dateOrNotSet } from "@/lib/tripLabel";
import fs from "fs";
import path from "path";
import { esc, fonts, htmlToPdf } from "@/outputs/pdf";
import { printOrder, roomLabel } from "@/domain/officeRooms";
import { loadOfficeState } from "./service";

/** The only place office rooms are printed: the internal rooming sheet (A4 landscape, 6 x 3 slots, slot 18 = trip summary). */
const COLORS = {
  MEN: { label: "رجال", bg: "#DCE8F6", fg: "#1F4E8C" },
  WOMEN: { label: "نساء", bg: "#ECE4F7", fg: "#5B3F8F" },
  FAMILY: { label: "عائلة", bg: "#E2F1E5", fg: "#2E6B3F" },
  EMPTY: { label: "سرير فارغ", bg: "#FFF3D1", fg: "#8A6400" },
} as const;
const TYPE_AR: Record<string, string> = { SINGLE: "سنكل", DOUBLE: "ثنائي", TRIPLE: "ثلاثي", QUAD: "رباعي", QUINT: "خماسي" };
const TYPE_ORDER = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "QUINT"];
const ROOM_SLOTS = 17;

/**
 * Optional house font for this print: public/fonts/custom/TheSans-Bold.otf (a licensed font, so it is not in git; copy it to the
 * server by hand). Without the file the bundled Noto Sans Arabic is used.
 */
function houseFont(): { css: string; family: string } {
  try {
    const b64 = fs.readFileSync(path.join(process.cwd(), "public/fonts/custom/TheSans-Bold.otf")).toString("base64");
    const src = `url(data:font/otf;base64,${b64}) format('opentype')`;
    return { css: `@font-face{font-family:'TheSans';font-weight:400;src:${src};}@font-face{font-family:'TheSans';font-weight:700;src:${src};}`, family: "'TheSans', " };
  } catch { return { css: "", family: "" }; }
}

export async function renderOfficeRoomsPdf(tripId: string): Promise<Buffer> {
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { supervisor: true } });
  const [state, company] = await Promise.all([loadOfficeState(db, tripId), getSetting("company")]);
  const pilgrims = await db.pilgrim.findMany({ where: { id: { in: state.bookings.map((b) => b.pilgrimId) } } });
  const nameOf = new Map(pilgrims.map((p) => [p.id, tripleNameAr(p)]));
  const bookingName = new Map(state.bookings.map((b) => [b.id, nameOf.get(b.pilgrimId) ?? ""]));
  const agents = await db.agent.findMany({ where: { roomCode: { not: null } }, orderBy: { roomCode: "asc" } });
  const usedCodes = new Set(state.rooms.map((r) => r.code).filter(Boolean));
  const legend = [...agents.filter((a) => usedCodes.has(a.roomCode)).map((a) => `${a.roomCode} = ${a.officeName || a.name}`), "بدون حرف = مختلط"].join("  ·  ");

  const tripHotels = await db.tripHotel.findMany({ where: { tripId }, include: { hotel: true } });
  const hotelName = new Map(tripHotels.map((h) => [h.id, h.hotel.localName ?? h.hotel.officialName]));
  const multiHotel = new Set(state.rooms.map((r) => r.hotelId ?? "")).size > 1;
  const byBooking = new Map(state.bookings.map((b) => [b.id, b]));
  // grouped by hotel when the trip has more than one, then coded rooms by code and number, then plain numbers
  const rooms = multiHotel
    ? [...new Set(state.rooms.map((r) => r.hotelId ?? ""))].sort((a, b) => (hotelName.get(a) ?? "~").localeCompare(hotelName.get(b) ?? "~")).flatMap((h) => printOrder(state.rooms.filter((r) => (r.hotelId ?? "") === h)))
    : printOrder(state.rooms);
  const housedOf = (r: (typeof rooms)[number]) => r.members.filter((m) => !m.noHousing).length;
  const men = state.rooms.reduce((n, r) => n + r.members.filter((m) => m.gender === "MALE").length, 0);
  const women = state.rooms.reduce((n, r) => n + r.members.filter((m) => m.gender === "FEMALE").length, 0);
  const pilgrimsTotal = men + women;
  const emptyBeds = state.rooms.reduce((n, r) => n + Math.max(0, r.capacity - r.members.filter((m) => !m.noHousing).length), 0);
  const perType = TYPE_ORDER.map((t) => [t, state.rooms.filter((r) => r.roomType === t).length] as const).filter(([, c]) => c > 0);
  const noType = state.rooms.filter((r) => !r.roomType).length;

  const card = (r: (typeof rooms)[number]) => {
    const c = COLORS[r.category];
    const empty = Math.max(0, r.capacity - housedOf(r));
    const dense = r.members.length + empty > 6 ? " dense" : "";
    const typeLabel = r.roomType ? TYPE_AR[r.roomType] : `${r.capacity} أسرّة`;
    return `<div class="room" style="border-color:${c.fg}"><div class="rh" style="background:${c.bg};color:${c.fg}"><b class="rl">${esc(roomLabel(r))}</b><span>${esc(typeLabel)} · ${c.label}${multiHotel && r.hotelId ? `<br><small class="hn">${esc(hotelName.get(r.hotelId) ?? "")}</small>` : ""}</span></div>
      <ol class="mem${dense}">${r.members.map((m, i) => `<li><span class="n">${i + 1}.</span> ${esc(bookingName.get(m.bookingId) ?? "")}${byBooking.get(m.bookingId)?.groups.some((g) => g.isHead && g.group.kind === "FAMILY") ? ` <span class="tag">رب الأسرة</span>` : ""}${byBooking.get(m.bookingId)?.withFood === false ? ` <span class="nf">بدون طعام</span>` : ""}${m.noHousing ? ` <span class="nf">بدون سكن</span>` : ""}</li>`).join("")}${Array.from({ length: empty }, () => `<li class="emp">—&nbsp; فارغ &nbsp;—</li>`).join("")}</ol></div>`;
  };
  const summary = `<div class="room sum"><div class="rh" style="background:#1B2A4A;color:#fff"><b>الملخص · الرحلة كاملة</b></div>
    <ul class="mem sm"><li>المعتمرون: <b>${pilgrimsTotal}</b></li><li>الغرف: <b>${state.rooms.length}</b></li>
    ${perType.map(([t, c]) => `<li>${TYPE_AR[t]}: <b>${c}</b></li>`).join("")}${noType ? `<li>بدون نوع: <b>${noType}</b></li>` : ""}
    <li>رجال: <b>${men}</b> · نساء: <b>${women}</b></li><li>أسرّة فارغة: <b>${emptyBeds}</b></li></ul></div>`;

  const pages = Math.max(1, Math.ceil(rooms.length / ROOM_SLOTS));
  const title = `التسكين الداخلي · ${trip.name}${trip.departDate ? ` · ${dateOrNotSet(trip.departDate)}` : ""}`;
  const sup = trip.supervisor ? `  ·  المشرف: ${trip.supervisor.name}` : "";
  const key = (bg: string, fg: string, l: string) => `<span class="key"><i style="background:${bg};border-color:${fg}"></i>${l}</span>`;
  let body = "";
  for (let p = 0; p < pages; p++) {
    const slice = rooms.slice(p * ROOM_SLOTS, (p + 1) * ROOM_SLOTS);
    const cells = [...slice.map(card), ...Array.from({ length: ROOM_SLOTS - slice.length }, () => `<div class="room blank"></div>`), summary];
    body += `<section class="page"><header><div class="t1"><h1>${esc(title)}</h1><b class="warn">داخلي للمكتب · لا يُسلَّم لأي جهة</b></div>
      <div class="t2"><span>${esc(legend)}${esc(sup)}</span><span class="keys">${key(COLORS.MEN.bg, COLORS.MEN.fg, COLORS.MEN.label)}${key(COLORS.WOMEN.bg, COLORS.WOMEN.fg, COLORS.WOMEN.label)}${key(COLORS.FAMILY.bg, COLORS.FAMILY.fg, COLORS.FAMILY.label)}${key(COLORS.EMPTY.bg, COLORS.EMPTY.fg, COLORS.EMPTY.label)}</span></div></header>
      <div class="grid">${cells.join("")}</div>
      <footer>${esc(company.name)} · صفحة ${p + 1} من ${pages}</footer></section>`;
  }
  const house = houseFont();
  const css = `${fonts()}${house.css}
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${house.family}'NotoArabic', 'DejaVu Sans', sans-serif; color: #111; font-size: 9px; }
.page { width: 297mm; height: 210mm; padding: 7mm 8mm 6mm; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
.page:last-child { page-break-after: auto; }
header { height: 20mm; flex: none; }
.t1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
h1 { margin: 0; font-size: 17px; color: #1B2A4A; }
.warn { color: #B42318; font-size: 11px; white-space: nowrap; }
.t2 { display: flex; justify-content: space-between; align-items: center; margin-top: 2mm; font-size: 11px; color: #333; gap: 8px; }
.keys { display: flex; gap: 8px; white-space: nowrap; } .key { display: inline-flex; align-items: center; gap: 3px; } .key i { width: 10px; height: 10px; border: 1px solid; border-radius: 2px; display: inline-block; }
.grid { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(3, 1fr); gap: 2.5mm; min-height: 0; }
.room { border: 1.2px solid #999; border-radius: 2mm; overflow: hidden; display: flex; flex-direction: column; background: #fff; min-height: 0; }
.room.blank { border: 1px dashed #ddd; background: #fcfcfc; }
.rh { padding: 1.2mm 2mm; display: flex; align-items: baseline; justify-content: space-between; gap: 4px; flex: none; }
.rl { font-size: 20px; line-height: 1.1; direction: ltr; unicode-bidi: plaintext; }
.rh span { font-size: 10px; font-weight: 700; }
.mem { margin: 0; padding: 1.2mm 2mm 1mm; list-style: none; font-size: 12px; font-weight: 700; line-height: 1.25; flex: 1; }
.mem.dense { font-size: 9px; line-height: 1.15; }
.mem li { padding: 0.15mm 0; overflow-wrap: anywhere; }
.mem .n { color: #555; font-weight: 400; }
.tag { font-size: 8px; background: #E2F1E5; color: #2E6B3F; border-radius: 1mm; padding: 0 1mm; } .nf { font-size: 8px; color: #B42318; font-weight: 700; } .hn { font-size: 8px; font-weight: 400; }
.mem .emp { background: ${COLORS.EMPTY.bg}; color: ${COLORS.EMPTY.fg}; border-radius: 1mm; padding: 0.4mm 1.5mm; margin: 0.4mm 0; text-align: center; }
.sum { border-color: #1B2A4A; } .sum .rh b { font-size: 11px; } .mem.sm { font-size: 12px; line-height: 1.5; }
footer { flex: none; text-align: center; font-size: 9px; color: #555; padding-top: 1.5mm; }`;
  return htmlToPdf(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`, { landscape: true, ownLayout: true });
}

/** Internal rooming as Excel: one row per pilgrim (RTL, frozen header, filters). Internal use only, like the PDF. */
export async function renderOfficeRoomsXlsx(tripId: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } });
  const state = await loadOfficeState(db, tripId);
  const [pilgrims, agents, tripHotels] = await Promise.all([
    db.pilgrim.findMany({ where: { id: { in: state.bookings.map((b) => b.pilgrimId) } } }),
    db.agent.findMany({ select: { id: true, name: true } }),
    db.tripHotel.findMany({ where: { tripId }, include: { hotel: true } }),
  ]);
  const P = new Map(pilgrims.map((p) => [p.id, p])), A = new Map(agents.map((a) => [a.id, a.name])), H = new Map(tripHotels.map((h) => [h.id, h.hotel.localName ?? h.hotel.officialName]));
  const byBooking = new Map(state.bookings.map((b) => [b.id, b]));
  const meta = await db.officeRoom.findMany({ where: { tripId }, select: { id: true, makkahHotelRoomNo: true, madinahHotelRoomNo: true } });
  const M = new Map(meta.map((m) => [m.id, m]));
  const CAT = { MEN: "رجال", WOMEN: "نساء", FAMILY: "عائلة" } as const;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("التسكين الداخلي", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const cols: [string, number][] = [["الغرفة", 9], ["الفندق", 22], ["غرفة مكة", 11], ["غرفة المدينة", 12], ["نوع الغرفة", 11], ["التصنيف", 9], ["الاسم", 34], ["الوكيل", 20], ["رب الأسرة", 10], ["الطعام", 10], ["الهاتف", 16]];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2A4A" } }; });
  for (const r of printOrder(state.rooms)) for (const m of r.members) {
    const b = byBooking.get(m.bookingId), p = b ? P.get(b.pilgrimId) : undefined;
    if (!b || !p) continue;
    ws.addRow([roomLabel(r), r.hotelId ? H.get(r.hotelId) ?? "" : "", M.get(r.id)?.makkahHotelRoomNo ?? "", M.get(r.id)?.madinahHotelRoomNo ?? "", r.roomType ? TYPE_AR[r.roomType] : "", CAT[r.category],
      tripleNameAr(p), m.agentId ? A.get(m.agentId) ?? "" : "", b.groups.some((g) => g.isHead && g.group.kind === "FAMILY") ? "نعم" : "", b.withFood ? "مع طعام" : "بدون طعام", p.phone ?? ""]);
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.eachRow((row) => row.eachCell((c) => { c.alignment = { horizontal: "right", vertical: "middle" }; }));
  void trip;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
