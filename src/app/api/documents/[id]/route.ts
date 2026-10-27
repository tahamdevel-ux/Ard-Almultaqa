import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth";
import { getFile } from "@/server/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("documents.view");
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { id } = await params;
  const doc = await db.pilgrimDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await getFile(doc.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": doc.mime, "Cache-Control": "private, no-store", "Content-Disposition": "inline" },
  });
}
