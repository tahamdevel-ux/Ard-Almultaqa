import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { canSeeTrip } from "@/server/trips";
import { renderReceipt } from "@/outputs/render";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("payments.view");
    const { id } = await params;
    const p = await db.payment.findUnique({ where: { id }, include: { booking: { include: { trip: true } } } });
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!canSeeTrip(user, p.booking.trip)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const buf = await renderReceipt(id);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="receipt-${p.receiptNo}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
