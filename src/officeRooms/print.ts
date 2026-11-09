import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { fullNameAr } from "@/server/pilgrims";
import { dateOrNotSet } from "@/lib/tripLabel";
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
const SLOTS = 18, ROOM_SLOTS = 17;

export async function renderOfficeRoomsPdf(tripId: string): Promise<Buffer> {
  const trip = await db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { supervisor: true } });
  const [state, company] = await Promise.all([loadOfficeState(db, tripId), getSetting("company")]);
  const pilgrims = await db.pilgrim.findMany({ where: { id: { in: state.bookings.map((b) => b.pilgrimId) } } });
  const nameOf = new Map(pilgrims.map((p) => [p.id, fullNameAr(p)]));
  const bookingName = new Map(state.bookings.map((b) => [b.id, nameOf.get(b.pilgrimId) ?? ""]));
  const agents = await db.agent.findMany({ where: { roomCode: { not: null } }, orderBy: { roomCode: "asc" } });
  const usedCodes = new Set(state.rooms.map((r) => r.code).filter(Boolean));
  const legend = [...agents.filter((a) => usedCodes.has(a.roomCode)).map((a) => `${a.roomCode} = ${a.officeName || a.name}`), "بدون حرف = مختلط"].join("  ·  ");

  const rooms = printOrder(state.rooms);
  const men = state.rooms.reduce((n, r) => n + r.members.filter((m) => m.gender === "MALE").length, 0);
  const women = state.rooms.reduce((n, r) => n + r.members.filter((m) => m.gender === "FEMALE").length, 0);
  const pilgrimsTotal = men + women;
  const emptyBeds = state.rooms.reduce((n, r) => n + Math.max(0, r.capacity - r.members.length), 0);
  const perType = TYPE_ORDER.map((t) => [t, state.rooms.filter((r) => r.roomType === t).length] as const).filter(([, c]) => c > 0);
  const noType = state.rooms.filter((r) => !r.roomType).length;

  const card = (r: (typeof rooms)[number]) => {
    const c = COLORS[r.category];
    const empty = Math.max(0, r.capacity - r.members.length);
    const dense = r.members.length + empty > 6 ? " dense" : "";
    const typeLabel = r.roomType ? TYPE_AR[r.roomType] : `${r.capacity} أسرّة`;
    return `<div class="room" style="border-color:${c.fg}"><div class="rh" style="background:${c.bg};color:${c.fg}"><b class="rl">${esc(roomLabel(r))}</b><span>${esc(typeLabel)} · ${c.label}</span></div>
      <ol class="mem${dense}">${r.members.map((m, i) => `<li><span class="n">${i + 1}.</span> ${esc(bookingName.get(m.bookingId) ?? "")}</li>`).join("")}${Array.from({ length: empty }, () => `<li class="emp">—&nbsp; فارغ &nbsp;—</li>`).join("")}</ol></div>`;
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
  const css = `${fonts()}
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'NotoArabic', 'DejaVu Sans', sans-serif; color: #111; font-size: 9px; }
.page { width: 297mm; height: 210mm; padding: 7mm 8mm 6mm; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
.page:last-child { page-break-after: auto; }
header { height: 20mm; flex: none; }
.t1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
h1 { margin: 0; font-size: 15px; color: #1B2A4A; }
.warn { color: #B42318; font-size: 11px; white-space: nowrap; }
.t2 { display: flex; justify-content: space-between; align-items: center; margin-top: 2mm; font-size: 9.5px; color: #333; gap: 8px; }
.keys { display: flex; gap: 8px; white-space: nowrap; } .key { display: inline-flex; align-items: center; gap: 3px; } .key i { width: 10px; height: 10px; border: 1px solid; border-radius: 2px; display: inline-block; }
.grid { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(3, 1fr); gap: 2.5mm; min-height: 0; }
.room { border: 1.2px solid #999; border-radius: 2mm; overflow: hidden; display: flex; flex-direction: column; background: #fff; min-height: 0; }
.room.blank { border: 1px dashed #ddd; background: #fcfcfc; }
.rh { padding: 1.2mm 2mm; display: flex; align-items: baseline; justify-content: space-between; gap: 4px; flex: none; }
.rl { font-size: 17px; line-height: 1.1; direction: ltr; unicode-bidi: plaintext; }
.rh span { font-size: 8.5px; font-weight: 700; }
.mem { margin: 0; padding: 1.2mm 2mm 1mm; list-style: none; font-size: 9.5px; line-height: 1.28; flex: 1; }
.mem.dense { font-size: 8px; line-height: 1.2; }
.mem li { padding: 0.15mm 0; overflow-wrap: anywhere; }
.mem .n { color: #555; }
.mem .emp { background: ${COLORS.EMPTY.bg}; color: ${COLORS.EMPTY.fg}; border-radius: 1mm; padding: 0.4mm 1.5mm; margin: 0.4mm 0; text-align: center; }
.sum { border-color: #1B2A4A; } .sum .rh b { font-size: 11px; } .mem.sm { font-size: 10.5px; line-height: 1.5; }
footer { flex: none; text-align: center; font-size: 9px; color: #555; padding-top: 1.5mm; }`;
  return htmlToPdf(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`, { landscape: true, ownLayout: true });
}
