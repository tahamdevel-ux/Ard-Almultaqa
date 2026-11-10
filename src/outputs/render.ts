import { esc, htmlToPdf, logoDataUri, pageHtml } from "./pdf";
import { joinMeta, tripMetaParts } from "./meta";
import { tripLabel } from "@/lib/tripLabel";
import { buildXlsx } from "./xlsx";
import { flightListData, manifestData } from "./viewmodels";

type Company = { name: string; address: string; phones: string };

function table(headers: string[], rows: (string | number)[][], ltrCols: number[] = []) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${ltrCols.includes(i) ? "ltr" : ""}">${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export async function renderManifest(tripId: string, busId: string, format: "pdf" | "xlsx") {
  const d = await manifestData(tripId, busId);
  const headers = ["المقعد", "الاسم بالعربي", "Name (passport)", "رقم الجواز"];
  const rows = d.rows.map((r) => [r.seat, r.nameAr, r.nameEn, r.passportNo]);
  const info = `<p>السائق: ${esc(d.bus.driverName ?? "")} <span class="ltr">${esc(d.bus.driverPhone ?? "")}</span> — الشركة: ${esc(d.bus.company ?? "")} — عدد الركاب: ${d.rows.length}</p>`;
  if (format === "xlsx") {
    return buildXlsx({ name: `باص ${d.bus.number}`, title: `${d.title} — ${d.meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 8 }, { header: headers[1], width: 34 }, { header: headers[2], width: 34 }, { header: headers[3], width: 16 }], rows });
  }
  return htmlToPdf(pageHtml(d.company as Company, d.title, esc(d.meta), info + table(headers, rows, [2, 3])));
}

export async function renderFlightList(tripId: string, format: "pdf" | "xlsx") {
  const d = await flightListData(tripId);
  const headers = ["#", "Name as in passport", "الاسم بالعربي", "رقم الجواز", "رقم التذكرة", "سيارة المطار"];
  const rows = d.rows.map((r) => [r.n, r.nameEn, r.nameAr, r.passportNo, r.ticketNo, r.car]);
  if (format === "xlsx") {
    return buildXlsx({ name: "Flight", title: `${d.title} — ${d.meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 6 }, { header: headers[1], width: 34 }, { header: headers[2], width: 34 }, { header: headers[3], width: 16 }, { header: headers[4], width: 18 }, { header: headers[5], width: 14 }], rows });
  }
  return htmlToPdf(pageHtml(d.company as Company, d.title, esc(d.meta), table(headers, rows, [1, 3, 4])));
}

import { roomingData } from "./viewmodels";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { getFile } from "@/server/storage";

export async function renderRooming(tripId: string, city: "MAKKAH" | "MADINAH", lang: "ar" | "en", format: "pdf" | "xlsx", tripHotelId?: string) {
  const d = await roomingData(tripId, city, tripHotelId);
  const ar = lang === "ar";
  const headers = ar ? ["الغرفة", "النوع", "الاسم", "رقم الجواز"] : ["Room", "Type", "Name (as in passport)", "Passport No"];
  const rows = d.rows.map((r) => (ar ? [r.roomNo, r.typeAr, r.nameAr, r.passportNo] : [r.roomNo, r.typeEn, r.nameEn, r.passportNo]));
  const title = ar ? `قائمة التسكين — ${d.cityAr}` : `Rooming list — ${d.cityEn}`;
  // check-in/out and the trip code are optional: missing parts drop out of the header line
  const meta = ar
    ? joinMeta([d.hotelAr, d.checkIn && `الدخول ${d.checkIn}`, d.checkOut && `الخروج ${d.checkOut}`, tripMetaParts(d.trip)[0]], " · ")
    : joinMeta([d.hotelEn, d.checkIn && `Check-in ${d.checkIn}`, d.checkOut && `Check-out ${d.checkOut}`, tripMetaParts(d.trip, "en")[0]], " · ");
  if (format === "xlsx") {
    return buildXlsx({ name: ar ? "التسكين" : "Rooming", title: `${title} — ${meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 10 }, { header: headers[1], width: 12 }, { header: headers[2], width: 38 }, { header: headers[3], width: 16 }], rows });
  }
  return htmlToPdf(pageHtml(d.company as Company, title, esc(meta), table(headers, rows, ar ? [3] : [0, 1, 2, 3]), ar ? "rtl" : "ltr"));
}

import { agentStatementData } from "./viewmodels";
import { formatDate as fmtDate } from "@/domain/dates";
import { formatMoney, paidTotal as paidSum } from "@/domain/money";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";

export async function renderAgentStatement(agentId: string, tripId: string | undefined, format: "pdf" | "xlsx") {
  const d = await agentStatementData(agentId, tripId);
  const c = d.currency;
  const headers = ["المعتمر", "الرحلة", "السعر", "المدفوع", "المتبقي", "الحالة"];
  const rows = d.rows.map((r) => [fullNameAr(r.b.pilgrim), r.b.trip.tripNo ?? r.b.trip.name, r.price == null ? "—" : formatMoney(r.price, c), formatMoney(r.paid, c),
    r.price == null || r.cancelled ? "—" : formatMoney(r.price - r.paid, c), r.cancelled ? "ملغى" : "فعّال"]);
  const sumLines: [string, string][] = [
    ["عدد المعتمرين الفعّالين", String(d.sum.count)], ["إجمالي الأسعار", formatMoney(d.sum.totalPrice, c)],
    ["العمولة", formatMoney(d.sum.commission, c)], ["المستحق للشركة بعد العمولة", formatMoney(d.sum.netToCompany, c)],
    ["المبالغ المستلمة (صافي)", formatMoney(d.sum.collected, c)],
    [d.sum.dueToCompany >= 0 ? "المتبقي على الوكيل للشركة" : "زيادة مدفوعة (للوكيل)", formatMoney(Math.abs(d.sum.dueToCompany), c)],
  ];
  const title = `كشف حساب الوكيل: ${d.agent.name}`;
  if (format === "xlsx") {
    return buildXlsx({ name: "كشف الوكيل", title, company: d.company as Company,
      columns: headers.map((h, i) => ({ header: h, width: i === 0 ? 34 : 16 })), rows: [...rows, [], ...sumLines] });
  }
  const sumHtml = `<table style="width:60%;margin-top:10px">${sumLines.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  return htmlToPdf(pageHtml(d.company as Company, title, esc(d.agent.officeName ?? ""), table(headers, rows) + sumHtml));
}

export async function renderReceipt(paymentId: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { booking: { include: { pilgrim: true, trip: true, payments: true } } } });
  const company = (await getSetting("company")) as Company;
  const b = p.booking, cur = b.priceCurrency;
  const bal = b.priceAmount == null ? null : b.priceAmount - paidSum(b.payments.filter((x) => x.receiptNo <= p.receiptNo).map((x) => ({ kind: x.kind, credited: Number(x.credited) })));
  const refund = p.kind === "REFUND";
  const line = (k: string, v: string) => `<tr><th style="width:35%">${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const body = `<table style="font-size:13px">
    ${line("رقم الوصل", String(p.receiptNo))}${line("التاريخ", fmtDate(p.paidAt))}
    ${line(refund ? "المبلغ المُسترد إلى" : "استلمنا من", fullNameAr(b.pilgrim))}${line("رقم الجواز", b.pilgrim.passportNo)}
    ${line("الرحلة", tripLabel(b.trip))}
    ${line("المبلغ", formatMoney(p.amount, p.currency))}
    ${p.exchangeRate ? line("سعر الصرف", `${p.exchangeRate} دينار لكل دولار`) + line("القيمة المحتسبة", formatMoney(Number(p.credited), cur)) : ""}
    ${line("الطريقة", { CASH: "نقداً", TRANSFER: "حوالة", CARD: "بطاقة", OTHER: "أخرى" }[p.method])}
    ${refund ? line("سبب الاسترداد", p.reason ?? "") : p.note ? line("ملاحظة", p.note) : ""}
    ${b.priceAmount != null ? line("سعر الحجز", formatMoney(b.priceAmount, cur)) + line("المتبقي بعد هذا الوصل", formatMoney(bal ?? 0, cur)) : ""}
    ${line("استلمها", p.receivedByName)}</table>
    <p style="margin-top:30px">التوقيع: ____________________</p>`;
  return htmlToPdf(pageHtml(company, refund ? "وصل استرداد" : "وصل قبض", `رقم ${p.receiptNo}`, body));
}

/** Bus seat map: A4, the 2+2 layout with seat numbers and names, one page per bus. */
export async function renderSeatMaps(tripId: string, busId?: string) {
  const { fullNameAr } = await import("@/server/pilgrims");
  const { db } = await import("@/server/db");
  const { getSetting } = await import("@/server/settings");
  const { SEATS_PER_ROW } = await import("@/domain/seating");
  const [company, trip] = await Promise.all([getSetting("company"), db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null } })]);
  const buses = await db.bus.findMany({ where: { tripId, ...(busId ? { id: busId } : {}) }, orderBy: { number: "asc" } });
  let body = "";
  for (const bus of buses) {
    const seats = await db.seatAssignment.findMany({ where: { busId: bus.id, booking: { status: "ACTIVE", deletedAt: null } }, include: { booking: { include: { pilgrim: true } } } });
    const by = new Map(seats.filter((x) => x.seatNo != null).map((x) => [x.seatNo!, x.booking]));
    const rows = Math.ceil(bus.seatCount / SEATS_PER_ROW);
    const seat = (n: number) => {
      if (n > bus.seatCount) return `<td class="gap"></td>`;
      const b = by.get(n);
      const role = b?.tripRole === "CONTRACTOR" ? "متعهد" : b?.tripRole === "DRIVER" ? "سايق" : b?.tripRole === "ASSISTANT" ? "مساعد سايق" : "";
      return `<td class="${b ? "full" : "free"}"><b>${n}</b>${b ? `<span>${esc(fullNameAr(b.pilgrim))}${role ? ` <i>(${role})</i>` : ""}</span>` : ""}</td>`;
    };
    let trs = "";
    for (let r = 0; r < rows; r++) {
      const base = r * SEATS_PER_ROW;
      trs += `<tr>${seat(base + 1)}${seat(base + 2)}<td class="aisle"></td>${seat(base + 3)}${seat(base + 4)}</tr>`;
    }
    body += `<section class="pg"><h2>خريطة مقاعد ${esc(busLabelOf(bus))} — ${esc(joinMeta(tripMetaParts(trip)))} (${seats.length} راكب)</h2><div class="front">◄ مقدمة الباص (السائق)</div><table class="map">${trs}</table></section>`;
  }
  const css = `.pg{page-break-after:always}.pg:last-child{page-break-after:auto}.map{table-layout:fixed;width:99%}.map td{height:15.5mm;border:1px solid #999;font-size:9px;padding:1px 3px;vertical-align:top}.map td b{display:inline-block;background:#4f5444;color:#fff;padding:0 4px;border-radius:2px;margin-left:3px}.map td.free{background:#f6f6f2}.map td.full{background:#fff}.map td.aisle{width:8mm;border:none;background:none}.map td.gap{border:none}.front{text-align:center;font-weight:700;margin:2mm 0;border:1px dashed #999;padding:2px}.map i{color:#8a6400}`;
  const html = pageHtml(company as Company, "خريطة مقاعد الباصات", "", body).replace("</style>", `${css}</style>`);
  return htmlToPdf(html);
}
const busLabelOf = (b: { number: string; name: string | null }) => `باص ${b.number}${b.name ? ` — ${b.name}` : ""}`;

/** Tickets list: one row per pilgrim — name as in passport, passport no., ticket number, تصريف choice. */
export async function renderTickets(tripId: string, format: "pdf" | "xlsx") {
  const { fullNameEn } = await import("@/server/pilgrims");
  const { db } = await import("@/server/db");
  const { getSetting } = await import("@/server/settings");
  const [company, trip] = await Promise.all([getSetting("company"), db.trip.findFirstOrThrow({ where: { id: tripId, deletedAt: null }, include: { flights: true } })]);
  const bookings = await db.booking.findMany({ where: { tripId, status: "ACTIVE", deletedAt: null }, include: { pilgrim: true, seat: true }, orderBy: { createdAt: "asc" } });
  const headers = ["#", "Name as in passport", "رقم الجواز", "رقم التذكرة", "التصريف"];
  const rows = bookings.map((b, i) => [i + 1, fullNameEn(b.pilgrim), b.pilgrim.passportNo, b.seat?.ticketNo ?? "", b.sarfByPilgrim ? "تصريف المعتمر" : "تصريف الشركة"]);
  const f = trip.flights[0];
  const meta = joinMeta([...tripMetaParts(trip).slice(0, 1), f ? `${f.flightNo} ${f.airline ?? ""}`.trim() : null, ...tripMetaParts(trip).slice(1)]);
  if (format === "xlsx") return buildXlsx({ name: "التذاكر", title: `قائمة التذاكر — ${meta}`, company: company as Company, columns: [{ header: headers[0], width: 6 }, { header: headers[1], width: 36 }, { header: headers[2], width: 16 }, { header: headers[3], width: 18 }, { header: headers[4], width: 16 }], rows });
  return htmlToPdf(pageHtml(company as Company, "قائمة التذاكر", esc(meta), table(headers, rows, [1, 2, 3])));
}
