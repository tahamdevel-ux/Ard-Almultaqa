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
