import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { can } from "@/lib/permissions";
import { escapeLike, searchTokens, sqlNormalize } from "@/domain/searchNorm";
import { dateRangeLabel, tripLabel } from "@/lib/tripLabel";
import { fullNameAr, fullNameEn } from "./pilgrims";

export type SearchResults = {
  pilgrims: { id: string; name: string; sub: string; allTripIds: string[]; head: boolean; trips: { id: string; label: string; dates: string; past: boolean }[] }[];
  trips: { id: string; label: string; sub: string }[];
  agents: { id: string; name: string; sub: string }[];
  hotels: { id: string; name: string; sub: string }[];
};

const LIMIT = 6;
const CITY = { MAKKAH: "مكة", MADINAH: "المدينة" } as const;

async function matchIds(table: string, cols: string[], tokens: string[], extraWhere: Prisma.Sql = Prisma.empty): Promise<string[]> {
  const expr = sqlNormalize(`concat_ws(' ', ${cols.map((c) => `"${c}"`).join(", ")})`);
  const patterns = tokens.map((t) => `%${escapeLike(t)}%`);
  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "deletedAt" IS NULL AND ${Prisma.raw(expr)} ILIKE ALL (${patterns}::text[]) ${extraWhere} LIMIT ${LIMIT}`,
  );
  return rows.map((r) => r.id);
}


export async function searchPilgrims(user: SessionUser, tokens: string[]): Promise<SearchResults["pilgrims"]> {
  const sup = user.role === "SUPERVISOR";
  const today = new Date();
  const cols = ["firstName", "fatherName", "grandfatherName", "greatGrandfatherName", "familyName", "enGivenName", "enFatherName", "enGrandfatherName", "enSurname", "passportNo", "phone"];
  // supervisors only reach pilgrims travelling on the trips assigned to them
  const restrict = sup
    ? Prisma.sql`AND "id" IN (SELECT b."pilgrimId" FROM "Booking" b JOIN "Trip" t ON t."id" = b."tripId" WHERE t."supervisorId" = ${user.id} AND b."status" = 'ACTIVE')`
    : Prisma.empty;
  const ids = await matchIds("Pilgrim", cols, tokens, restrict);
  if (!ids.length) return [];
  const rows = await db.pilgrim.findMany({
    where: { id: { in: ids } },
    include: { bookings: { where: { status: "ACTIVE", deletedAt: null, ...(sup ? { trip: { supervisorId: user.id } } : {}) }, include: { trip: true, groups: true }, orderBy: { createdAt: "desc" } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: fullNameAr(p),
    sub: `${fullNameEn(p)} — ${p.passportNo}${p.phone ? ` — ${p.phone}` : ""}`,
    allTripIds: p.bookings.map((b) => b.tripId),
    head: p.bookings.some((b) => b.groups.some((g) => g.isHead)),
    trips: p.bookings.slice(0, 4).map((b) => ({
      id: b.tripId, label: tripLabel(b.trip), dates: dateRangeLabel(b.trip.departDate, b.trip.returnDate),
      past: !!(b.trip.returnDate ?? b.trip.departDate) && (b.trip.returnDate ?? b.trip.departDate)! < today,
    })),
  }));
}

export async function globalSearch(user: SessionUser, q: string): Promise<SearchResults> {
  const tokens = searchTokens(q);
  const out: SearchResults = { pilgrims: [], trips: [], agents: [], hotels: [] };
  if (!tokens.length) return out;
  const sup = user.role === "SUPERVISOR";

  if (can(user.role, "pilgrims.view")) out.pilgrims = await searchPilgrims(user, tokens);

  if (can(user.role, "trips.view")) {
    const restrict = sup ? Prisma.sql`AND "supervisorId" = ${user.id}` : Prisma.empty;
    const ids = await matchIds("Trip", ["tripNo", "name"], tokens, Prisma.sql`${restrict} AND "archivedAt" IS NULL`);
    if (ids.length) {
      const rows = await db.trip.findMany({ where: { id: { in: ids } } });
      out.trips = rows.map((t) => ({ id: t.id, label: tripLabel(t), sub: dateRangeLabel(t.departDate, t.returnDate) }));
    }
  }

  if (can(user.role, "agents.view")) {
    const ids = await matchIds("Agent", ["name", "officeName"], tokens);
    if (ids.length) {
      const rows = await db.agent.findMany({ where: { id: { in: ids } } });
      out.agents = rows.map((a) => ({ id: a.id, name: a.name, sub: a.officeName ?? "" }));
    }
  }

  if (can(user.role, "hotels.view")) {
    const ids = await matchIds("Hotel", ["officialName", "localName"], tokens);
    if (ids.length) {
      const rows = await db.hotel.findMany({ where: { id: { in: ids } } });
      out.hotels = rows.map((h) => ({ id: h.id, name: h.localName || h.officialName, sub: CITY[h.city] }));
    }
  }
  return out;
}
