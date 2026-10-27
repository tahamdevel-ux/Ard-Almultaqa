import ExcelJS from "exceljs";

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
  ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = spec.company.name; ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = `${spec.company.address} ${spec.company.phones}`;
  ws.mergeCells(3, 1, 3, n); ws.getCell(3, 1).value = spec.title; ws.getCell(3, 1).font = { bold: true };
  const head = ws.getRow(5);
  spec.columns.forEach((c, i) => { head.getCell(i + 1).value = c.header; ws.getColumn(i + 1).width = c.width; });
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFE9" } }; c.border = { bottom: { style: "thin" } }; });
  spec.rows.forEach((r, i) => ws.getRow(6 + i).values = r);
  ws.eachRow((row) => row.eachCell((c) => { c.alignment = { horizontal: "right", vertical: "middle" }; }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
