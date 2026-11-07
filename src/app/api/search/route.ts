import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { globalSearch } from "@/server/search";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ pilgrims: [], trips: [], agents: [], hotels: [] });
  return NextResponse.json(await globalSearch(user, q.slice(0, 80)), { headers: { "Cache-Control": "no-store" } });
}
