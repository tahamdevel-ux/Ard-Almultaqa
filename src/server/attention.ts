import { db } from "./db";
import { addMonths } from "@/domain/dates";
import { getSetting } from "./settings";

/** The «needs attention» counters of the dashboard. Each count matches the pilgrims-list filter of the same name. */
export async function attentionCounts(opts: { rooms: boolean; money: boolean }) {
  const live = { status: "ACTIVE" as const, deletedAt: null, trip: { deletedAt: null } };
  const minMonths = await getSetting("passportMinMonths");
  const upcoming = { deletedAt: null, archivedAt: null, status: { in: ["OPEN", "FULL", "TRAVELLING"] as ("OPEN" | "FULL" | "TRAVELLING")[] } };
  const [expiring, noRoom, noPrice, trips] = await Promise.all([
    db.pilgrim.count({ where: { deletedAt: null, passportExpiry: { lt: addMonths(new Date(), minMonths) }, bookings: { some: { ...live, trip: upcoming } } } }),
    opts.rooms ? db.pilgrim.count({ where: { deletedAt: null, bookings: { some: { ...live, officeMember: null } } } }) : Promise.resolve(null),
    opts.money ? db.pilgrim.count({ where: { deletedAt: null, bookings: { some: { ...live, priceAmount: null } } } }) : Promise.resolve(null),
    db.trip.findMany({ where: { deletedAt: null, archivedAt: null, capacity: { gt: 0 } }, select: { capacity: true, _count: { select: { bookings: { where: { status: "ACTIVE", deletedAt: null } } } } } }),
  ]);
  return { expiring, noRoom, noPrice, overCapacity: trips.filter((t) => t._count.bookings > t.capacity).length };
}
