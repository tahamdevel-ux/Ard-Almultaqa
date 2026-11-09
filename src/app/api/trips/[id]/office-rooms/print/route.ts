import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { canSeeTrip } from "@/server/trips";
import { renderOfficeRoomsPdf } from "@/officeRooms/print";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Internal office rooming sheet: the only document that contains office room numbers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requirePermission("officeRooms.view");
    const trip = await db.trip.findFirst({ where: { id, deletedAt: null } });
    if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!canSeeTrip(user, trip)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const buf = await renderOfficeRoomsPdf(id);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="office-rooms-${trip.tripNo ?? trip.id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
