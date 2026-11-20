import { db, type DbTx } from "./db";
import type { SessionUser } from "./auth";
import { nextColorIdx, type LinkInfo } from "@/domain/links";
import { tripleNameAr } from "./pilgrims";

type Tx = DbTx;
export type LinkResult = { ok: true; info?: string } | { ok: false; error: string };

/** Links the given bookings of a trip into ONE «ارتباط» (links any of them already had are merged into it). */
export async function linkBookings(tx: Tx, user: Pick<SessionUser, "id" | "name">, tripId: string, bookingIds: string[], note: string | null): Promise<LinkResult> {
  const ids = [...new Set(bookingIds)];
  if (ids.length < 2) return { ok: false, error: "اختر معتمرَين على الأقل للربط" };
  const found = await tx.booking.findMany({ where: { id: { in: ids }, tripId, status: "ACTIVE", deletedAt: null }, include: { link: true } });
  if (found.length !== ids.length) return { ok: false, error: "أحد المعتمرين غير موجود في هذه الرحلة" };
  const existing = [...new Set(found.map((b) => b.link?.linkId).filter((x): x is string => !!x))];
  let linkId = existing[0];
  if (!linkId) {
    const used = (await tx.bookingLink.findMany({ where: { tripId }, select: { colorIdx: true } })).map((l) => l.colorIdx);
    linkId = (await tx.bookingLink.create({ data: { tripId, colorIdx: nextColorIdx(used), note } })).id;
  } else if (note !== null) await tx.bookingLink.update({ where: { id: linkId }, data: { note } });
  // everyone of the merged links joins the first one
  const merged = existing.slice(1);
  if (merged.length) {
    await tx.bookingLinkMember.updateMany({ where: { linkId: { in: merged } }, data: { linkId } });
    await tx.bookingLink.deleteMany({ where: { id: { in: merged } } });
  }
  const have = new Set(found.filter((b) => b.link?.linkId === linkId).map((b) => b.id));
  const add = ids.filter((id) => !have.has(id));
  // those that were in a merged link are already moved above
  const stillFree = (await tx.bookingLinkMember.findMany({ where: { bookingId: { in: add } }, select: { bookingId: true } })).map((m) => m.bookingId);
  const toCreate = add.filter((id) => !stillFree.includes(id));
  if (toCreate.length) await tx.bookingLinkMember.createMany({ data: toCreate.map((bookingId) => ({ linkId: linkId!, bookingId })) });
  await tx.auditLog.create({ data: { userId: user.id, userName: user.name, entity: "BookingLink", entityId: linkId, field: "members", oldValue: null, newValue: ids.join(",") } });
  return { ok: true };
}

/** Takes the given bookings out of their «ارتباط»; a link left with fewer than two members is deleted. */
export async function unlinkBookings(tx: Tx, user: Pick<SessionUser, "id" | "name">, tripId: string, bookingIds: string[]): Promise<LinkResult> {
  const members = await tx.bookingLinkMember.findMany({ where: { bookingId: { in: bookingIds }, link: { tripId } } });
  if (!members.length) return { ok: true };
  await tx.bookingLinkMember.deleteMany({ where: { id: { in: members.map((m) => m.id) } } });
  for (const linkId of new Set(members.map((m) => m.linkId))) {
    const left = await tx.bookingLinkMember.count({ where: { linkId } });
    if (left < 2) await tx.bookingLink.delete({ where: { id: linkId } }); // members cascade
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, entity: "BookingLink", entityId: linkId, field: "unlinked", oldValue: members.filter((m) => m.linkId === linkId).map((m) => m.bookingId).join(","), newValue: null } });
  }
  return { ok: true };
}

/** bookingId → its «ارتباط» (colour, note, names of the others), only links with two or more live members. */
export async function loadLinks(tripId: string): Promise<Map<string, LinkInfo>> {
  const links = await db.bookingLink.findMany({
    where: { tripId },
    include: { members: { where: { booking: { status: "ACTIVE", deletedAt: null } }, include: { booking: { include: { pilgrim: true } } } } },
  });
  const out = new Map<string, LinkInfo>();
  for (const l of links) {
    if (l.members.length < 2) continue;
    for (const m of l.members) out.set(m.bookingId, { linkId: l.id, colorIdx: l.colorIdx, note: l.note, with: l.members.filter((x) => x.bookingId !== m.bookingId).map((x) => tripleNameAr(x.booking.pilgrim)) });
  }
  return out;
}
