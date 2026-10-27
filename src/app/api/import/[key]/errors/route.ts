import { NextResponse } from "next/server";
import { AuthError, requirePermission } from "@/server/auth";
import { getFile } from "@/server/storage";

export async function GET(_r: Request, { params }: { params: Promise<{ key: string }> }) {
  try { await requirePermission("import.run"); } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { key } = await params;
  try {
    const buf = await getFile(key);
    return new NextResponse(new Uint8Array(buf), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="import-errors.xlsx"', "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }
}
