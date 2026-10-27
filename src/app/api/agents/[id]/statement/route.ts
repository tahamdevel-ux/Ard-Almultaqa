import { NextResponse } from "next/server";
import { AuthError, requirePermission } from "@/server/auth";
import { renderAgentStatement } from "@/outputs/render";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("payments.view");
    const { id } = await params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
    const buf = await renderAgentStatement(id, url.searchParams.get("trip") || undefined, format);
    return new NextResponse(new Uint8Array(buf), { headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="agent-statement.${format}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
