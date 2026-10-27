import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { canSeeTrip } from "@/server/trips";
import { renderFlightList, renderIdCards, renderManifest, renderMissing, renderRooming } from "@/outputs/render";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  try {
    const user = await requirePermission("outputs.view");
    const trip = await db.trip.findFirst({ where: { id, deletedAt: null } });
    if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!canSeeTrip(user, trip)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let buf: Buffer;
    if (kind === "manifest") {
      const busId = url.searchParams.get("bus") ?? "";
      buf = await renderManifest(id, busId, format);
    } else if (kind === "flight-list") buf = await renderFlightList(id, format);
    else if (kind === "rooming-ar" || kind === "rooming-en") {
      const city = url.searchParams.get("city") === "MAKKAH" ? "MAKKAH" : "MADINAH";
      buf = await renderRooming(id, city, kind === "rooming-ar" ? "ar" : "en", format);
    } else if (kind === "missing") buf = await renderMissing(id, format);
    else if (kind === "id-cards") buf = await renderIdCards(id);
    else return NextResponse.json({ error: "unknown output" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}-${trip.tripNo}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
