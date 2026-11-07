import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { searchPilgrims } from "@/server/search";
import { searchTokens } from "@/domain/searchNorm";

/** Pilgrim search for the "add pilgrim" popup of one trip; flags those already on it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "bookings.write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const tokens = searchTokens(new URL(req.url).searchParams.get("q") ?? "");
  if (tokens.join("").length < 2) return NextResponse.json({ results: [] });
  const found = await searchPilgrims(user, tokens);
  return NextResponse.json({ results: found.map((p) => ({ id: p.id, name: p.name, sub: p.sub, trips: p.trips, inThis: p.allTripIds.includes(id) })) }, { headers: { "Cache-Control": "no-store" } });
}
