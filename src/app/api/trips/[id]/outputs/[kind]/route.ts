import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { canSeeTrip } from "@/server/trips";
import { hayaData } from "@/outputs/viewmodels";
import { fillHaya } from "@/outputs/haya";
import { renderSeatMaps, renderTickets, renderFlightList, renderManifest, renderRooming } from "@/outputs/render";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    if (kind === "haya") {
      const d = await hayaData(id, url.searchParams.get("bus") ?? "");
      const out = await fillHaya(d.header, d.people, d.departOn);
      return new NextResponse(new Uint8Array(out), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="haya-manifest-bus-${encodeURIComponent(d.bus.number)}.xlsx"`, "Cache-Control": "private, no-store" } });
    }
    if (kind === "manifest") {
      const busId = url.searchParams.get("bus") ?? "";
      buf = await renderManifest(id, busId, format);
    } else if (kind === "flight-list") buf = await renderFlightList(id, format);
    else if (kind === "tickets") buf = await renderTickets(id, format);
    else if (kind === "seat-map") buf = await renderSeatMaps(id, url.searchParams.get("bus") || undefined);
    else if (kind === "rooming-ar" || kind === "rooming-en") {
      const city = url.searchParams.get("city") === "MAKKAH" ? "MAKKAH" : "MADINAH";
      buf = await renderRooming(id, city, kind === "rooming-ar" ? "ar" : "en", format, url.searchParams.get("hotel") || undefined);
    } else return NextResponse.json({ error: "unknown output" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}-${trip.tripNo ?? trip.id.slice(0, 8)}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as { code?: string })?.code === "P2025") return NextResponse.json({ error: "not found" }, { status: 404 }); // e.g. a bus that is not on this trip
    throw e;
  }
}
