import { esc, htmlToPdf, pageHtml } from "./pdf";
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
    cards.push(`<div class="card"><div class="top"><div class="ph">${photo ? `<img src="${photo}">` : ""}</div>
      <div class="info"><b>${esc(fullNameAr(b.pilgrim))}</b><div class="ltr">${esc(fullNameEn(b.pilgrim))}</div>
      <div>جواز: <span class="ltr">${esc(b.pilgrim.passportNo)}</span></div><div>الرحلة: <b>${esc(d.trip.tripNo)}</b></div></div>
      <img class="qr" src="${qr}"></div>
      <div class="small">مكة: ${esc(hotel(d.trip.makkahHotel))} — المدينة: ${esc(hotel(d.trip.madinahHotel))}</div>
      <div class="small">المشرف: ${esc(d.trip.supervisor?.name ?? "")} <span class="ltr">${esc(d.trip.supervisor?.phone ?? "")}</span></div>
      <div class="co">${esc((d.company as Company).name)}</div></div>`);
  }
  const css = `<style>.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.card{border:1.5px solid #0f5132;border-radius:6px;padding:6px;height:60mm;page-break-inside:avoid;font-size:10px}
  .top{display:flex;gap:6px;align-items:flex-start}.ph{width:24mm;height:30mm;border:1px solid #aaa;flex:none}.ph img{width:100%;height:100%;object-fit:cover}
  .info{flex:1;line-height:1.5}.qr{width:20mm;height:20mm}.small{margin-top:3px;font-size:9px}.co{margin-top:3px;color:#0f5132;font-weight:700;font-size:9px}</style>`;
  return htmlToPdf(pageHtml(d.company as Company, "بطاقات المعتمرين", esc(`الرحلة ${d.trip.tripNo}`), css + `<div class="grid">${cards.join("")}</div>`));
}
