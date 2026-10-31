import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Public liveness + database check for load balancers, Docker and uptime monitors. Reveals no data. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "database_unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
