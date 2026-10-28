import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export interface SheetSpec {
  name: string;
  title: string;
  company: { name: string; address: string; phones: string };
  columns: { header: string; width: number }[];
  rows: (string | number | null)[][];
}

export async function buildXlsx(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.name.slice(0, 31), { views: [{ rightToLeft: true }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const n = spec.columns.length;
  const logo = wb.addImage({ buffer: fs.readFileSync(path.join(process.cwd(), "public/brand/logo-192.png")) as unknown as ExcelJS.Buffer, extension: "png" });
  for (const r of [1, 2, 3]) ws.getRow(r).height = 22;
  ws.addImage(logo, { tl: { col: 0.1, row: 0.1 }, ext: { width: 62, height: 62 } });
  const from = n > 1 ? 2 : 1; // leave column A for the logo
  const gold = "FFE3B02E", olive = "FF3B3F32";
  ws.mergeCells(1, from, 1, n); ws.getCell(1, from).value = spec.company.name; ws.getCell(1, from).font = { bold: true, size: 14, color: { argb: olive } };
  ws.mergeCells(2, from, 2, n); ws.getCell(2, from).value = `${spec.company.address} ${spec.company.phones}`; ws.getCell(2, from).font = { color: { argb: "FF6B7157" } };
  ws.mergeCells(3, from, 3, n); ws.getCell(3, from).value = spec.title; ws.getCell(3, from).font = { bold: true, color: { argb: olive } };
  for (let c = 1; c <= n; c++) ws.getCell(4, c).border = { top: { style: "medium", color: { argb: gold } } };
  const head = ws.getRow(5);
  spec.columns.forEach((c, i) => { head.getCell(i + 1).value = c.header; ws.getColumn(i + 1).width = c.width; });
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F5444" } }; });
  spec.rows.forEach((r, i) => ws.getRow(6 + i).values = r);
  ws.eachRow((row) => row.eachCell((c) => { c.alignment = { horizontal: "right", vertical: "middle" }; }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
