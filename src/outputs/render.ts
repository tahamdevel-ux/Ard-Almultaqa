import { esc, htmlToPdf, logoDataUri, pageHtml } from "./pdf";
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
  const headers = ["المقعد", "الاسم بالعربي", "Name (passport)", "رقم الجواز", "رقم التأشيرة"];
  const rows = d.rows.map((r) => [r.seat, r.nameAr, r.nameEn, r.passportNo, r.visaNo]);
  const info = `<p>السائق: ${esc(d.bus.driverName ?? "")} <span class="ltr">${esc(d.bus.driverPhone ?? "")}</span> — الشركة: ${esc(d.bus.company ?? "")} — عدد الركاب: ${d.rows.length}</p>`;
  if (format === "xlsx") {
    return buildXlsx({ name: `باص ${d.bus.number}`, title: `${d.title} — ${d.meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 8 }, { header: headers[1], width: 34 }, { header: headers[2], width: 34 }, { header: headers[3], width: 16 }, { header: headers[4], width: 16 }], rows });
  }
  return htmlToPdf(pageHtml(d.company as Company, d.title, esc(d.meta), info + table(headers, rows, [2, 3, 4])));
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

import QRCode from "qrcode";
import { missingData, roomingData, idCardData } from "./viewmodels";
import { fullNameAr, fullNameEn } from "@/server/pilgrims";
import { getFile } from "@/server/storage";

export async function renderRooming(tripId: string, city: "MAKKAH" | "MADINAH", lang: "ar" | "en", format: "pdf" | "xlsx") {
  const d = await roomingData(tripId, city);
  const ar = lang === "ar";
  const headers = ar ? ["الغرفة", "النوع", "الاسم", "رقم الجواز"] : ["Room", "Type", "Name (as in passport)", "Passport No"];
  const rows = d.rows.map((r) => (ar ? [r.roomNo, r.typeAr, r.nameAr, r.passportNo] : [r.roomNo, r.typeEn, r.nameEn, r.passportNo]));
  const title = ar ? `قائمة التسكين — ${d.cityAr}` : `Rooming list — ${d.cityEn}`;
  const meta = ar ? `${d.hotelAr} · الدخول ${d.checkIn} · الخروج ${d.checkOut} · الرحلة ${d.trip.tripNo}`
    : `${d.hotelEn} · Check-in ${d.checkIn} · Check-out ${d.checkOut} · Trip ${d.trip.tripNo}`;
  if (format === "xlsx") {
    return buildXlsx({ name: ar ? "التسكين" : "Rooming", title: `${title} — ${meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 10 }, { header: headers[1], width: 12 }, { header: headers[2], width: 38 }, { header: headers[3], width: 16 }], rows });
  }
  return htmlToPdf(pageHtml(d.company as Company, title, esc(meta), table(headers, rows, ar ? [3] : [0, 1, 2, 3]), ar ? "rtl" : "ltr"));
}

export async function renderMissing(tripId: string, format: "pdf" | "xlsx") {
  const d = await missingData(tripId);
  const headers = ["#", "الاسم", "رقم الجواز", "الهاتف", "النواقص"];
  const rows = d.rows.map((r, i) => [i + 1, r.nameAr, r.passportNo, r.phone, r.items.join(" — ")]);
  if (format === "xlsx") {
    return buildXlsx({ name: "النواقص", title: `${d.title} — ${d.meta}`, company: d.company as Company,
      columns: [{ header: headers[0], width: 6 }, { header: headers[1], width: 34 }, { header: headers[2], width: 16 }, { header: headers[3], width: 16 }, { header: headers[4], width: 70 }], rows });
  }
  const summary = `<p>المعتمرون: ${d.total} · لديهم نواقص: ${d.rows.length}</p>`;
  return htmlToPdf(pageHtml(d.company as Company, d.title, esc(d.meta), summary + table(headers, rows, [2, 3])));
}

export async function renderIdCards(tripId: string) {
  const d = await idCardData(tripId);
  const hotel = (h?: { localName: string | null; officialName: string } | null) => (h ? h.localName ?? h.officialName : "—");
  const cards: string[] = [];
  for (const b of d.bookings) {
    const qr = await QRCode.toDataURL(b.id, { margin: 0, width: 160 });
    let photo = "";
    const doc = b.pilgrim.documents[0];
    if (doc && doc.mime.startsWith("image/")) {
      try { photo = `data:${doc.mime};base64,${(await getFile(doc.storageKey)).toString("base64")}`; } catch { /* missing file: leave blank */ }
    }
    cards.push(`<div class="card"><div class="cb"><img src="${logoDataUri()}"><b>${esc((d.company as Company).name)}</b><span>${esc(d.trip.tripNo)}</span></div>
      <div class="top"><div class="ph">${photo ? `<img src="${photo}">` : ""}</div>
      <div class="info"><b class="nm">${esc(fullNameAr(b.pilgrim))}</b><div class="ltr">${esc(fullNameEn(b.pilgrim))}</div>
      <div>جواز: <span class="ltr">${esc(b.pilgrim.passportNo)}</span></div></div>
      <img class="qr" src="${qr}"></div>
      <div class="small"><b>مكة:</b> ${esc(hotel(d.trip.makkahHotel))} — <b>المدينة:</b> ${esc(hotel(d.trip.madinahHotel))}</div>
      <div class="small"><b>المشرف:</b> ${esc(d.trip.supervisor?.name ?? "")} <span class="ltr">${esc(d.trip.supervisor?.phone ?? "")}</span></div></div>`);
  }
  const css = `<style>.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .card{border:1.5px solid #4f5444;border-radius:8px;overflow:hidden;height:60mm;page-break-inside:avoid;font-size:10px;display:flex;flex-direction:column;background:#fff}
  .cb{background:#4f5444;color:#fff;display:flex;align-items:center;gap:6px;padding:3px 6px;border-bottom:2.5px solid #e3b02e}
  .cb img{width:20px;height:20px}.cb b{font-size:10px}.cb span{margin-right:auto;font-size:9px;color:#f2c744;font-weight:700}
  .top{display:flex;gap:6px;align-items:flex-start;padding:5px 6px}.ph{width:22mm;height:28mm;border:1px solid #cfd2c4;border-radius:4px;flex:none;background:#f6f6f2}.ph img{width:100%;height:100%;object-fit:cover;border-radius:4px}
  .info{flex:1;line-height:1.55}.nm{font-size:11px;color:#3b3f32}.qr{width:19mm;height:19mm}
  .small{padding:0 6px;font-size:9px;color:#3b3f32}.small b{color:#4f5444}</style>`;
  return htmlToPdf(pageHtml(d.company as Company, "بطاقات المعتمرين", esc(`الرحلة ${d.trip.tripNo}`), css + `<div class="grid">${cards.join("")}</div>`));
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
  const rows = d.rows.map((r) => [fullNameAr(r.b.pilgrim), r.b.trip.tripNo, r.price == null ? "—" : formatMoney(r.price, c), formatMoney(r.paid, c),
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
    ${line("الرحلة", `${b.trip.tripNo} — ${b.trip.name}`)}
    ${line("المبلغ", formatMoney(p.amount, p.currency))}
    ${p.exchangeRate ? line("سعر الصرف", `${p.exchangeRate} دينار لكل دولار`) + line("القيمة المحتسبة", formatMoney(Number(p.credited), cur)) : ""}
    ${line("الطريقة", { CASH: "نقداً", TRANSFER: "حوالة", CARD: "بطاقة", OTHER: "أخرى" }[p.method])}
    ${refund ? line("سبب الاسترداد", p.reason ?? "") : p.note ? line("ملاحظة", p.note) : ""}
    ${b.priceAmount != null ? line("سعر الحجز", formatMoney(b.priceAmount, cur)) + line("المتبقي بعد هذا الوصل", formatMoney(bal ?? 0, cur)) : ""}
    ${line("استلمها", p.receivedByName)}</table>
    <p style="margin-top:30px">التوقيع: ____________________</p>`;
  return htmlToPdf(pageHtml(company, refund ? "وصل استرداد" : "وصل قبض", `رقم ${p.receiptNo}`, body));
}
