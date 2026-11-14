import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

/**
 * "Messy production" data: everything a real database ends up with after months of use and several program versions —
 * empty optional fields, trips without dates or hotels, prices missing, cancelled and archived rows, broken links.
 * The crawl test opens every page with this data and fails on any server error.
 */
export const ROLES = ["ADMIN", "REGISTRATION", "HOUSING", "ACCOUNTANT", "SUPERVISOR"] as const;
export const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
const d = (s: string) => new Date(s + "T00:00:00Z");

export async function seedHostile(db: PrismaClient) {
  const hash = await argon2.hash(PW, { type: argon2.argon2id });
  const users: Record<string, string> = {};
  for (const role of ROLES) {
    const u = await db.user.upsert({
      where: { username: role === "ADMIN" ? "admin" : `crawl_${role.toLowerCase()}` },
      create: { username: role === "ADMIN" ? "admin" : `crawl_${role.toLowerCase()}`, name: `مستخدم ${role}`, passwordHash: hash, role },
      update: { passwordHash: hash, role, active: true },
    });
    users[role] = u.id;
  }
  const mk = await db.hotel.create({ data: { officialName: "Hotel With No Prices", city: "MAKKAH" } });
  const mk2 = await db.hotel.create({ data: { officialName: "Swiss", localName: "سويس مقام", city: "MAKKAH" } });
  const md = await db.hotel.create({ data: { officialName: "Dar", city: "MADINAH", licenseNo: "" } });
  await db.hotel.create({ data: { officialName: "Deleted hotel", city: "MAKKAH", deletedAt: new Date() } });
  const agent = await db.agent.create({ data: { name: "وكيل", phones: [], roomCode: "a" } });
  const agentBare = await db.agent.create({ data: { name: "وكيل بلا شيء", phones: [] } });
  const agentGone = await db.agent.create({ data: { name: "وكيل محذوف", phones: ["0770"], deletedAt: new Date() } });

  // trips: bare (no dates, no hotels), full land, air, archived, soft-deleted, cancelled status
  const bare = await db.trip.create({ data: { name: "رحلة فارغة", transportType: "LAND", capacity: 0 } });
  const land = await db.trip.create({ data: { tripNo: "L-1", name: "بري كامل", transportType: "LAND", capacity: 40, departDate: d("2027-03-01"), returnDate: d("2027-03-12"), nightsMakkah: 7, nightsMadinah: 3, supervisorId: users.SUPERVISOR, madinahHotelId: md.id, makkahHotelId: mk2.id } });
  const air = await db.trip.create({ data: { tripNo: "A-1", name: "جوي", transportType: "AIR", capacity: 10, departDate: d("2027-04-01"), sarfAmount: 100, agentCommission: 50 } });
  const arch = await db.trip.create({ data: { name: "مؤرشفة", transportType: "LAND", capacity: 5, archivedAt: new Date(), status: "RETURNED" } });
  const gone = await db.trip.create({ data: { name: "محذوفة", transportType: "LAND", capacity: 5, deletedAt: new Date() } });
  await db.trip.create({ data: { name: "ملغاة", transportType: "AIR", capacity: 5, status: "CANCELLED", returnDate: d("2027-01-01") } });

  const thNoPrice = await db.tripHotel.create({ data: { tripId: land.id, hotelId: mk.id } });
  const th = await db.tripHotel.create({ data: { tripId: land.id, hotelId: mk2.id, noHousingPrice: 400, prices: { create: [{ roomType: "DOUBLE", amount: 850 }, { roomType: "QUAD", amount: 550 }] } } });
  const bus = await db.bus.create({ data: { tripId: land.id, number: "1", seatCount: 4 } });
  await db.bus.create({ data: { tripId: land.id, number: "2", name: "باص بلا مقاعد", seatCount: 0 } });
  const car = await db.groundCar.create({ data: { tripId: air.id, label: "سيارة", driverName: "" } });
  const flight = await db.flight.create({ data: { tripId: air.id, flightNo: "IA1" } });

  let n = 0;
  const pil = (o: Record<string, unknown> = {}) => db.pilgrim.create({
    data: { firstName: `اسم${++n}`, fatherName: "أب", grandfatherName: "جد", familyName: "عائلة", gender: n % 2 ? "MALE" : "FEMALE", birthDate: d("1980-01-01"), passportNo: `A${String(10000000 + n)}`, enGivenName: "NAME", enSurname: "SUR", passportExpiry: d("2030-01-01"), ...o } as never,
  });
  const booking = (pilgrimId: string, tripId: string, o: Record<string, unknown> = {}) => db.booking.create({ data: { pilgrimId, tripId, ...o } as never });

  const p0 = await pil(); // no booking at all
  const p1 = await pil({ passportExpiry: d("1900-01-01"), phone: "", motherName: "", agentId: agentGone.id }); // expired / empty strings / deleted agent
  const p2 = await pil({ passportExpiry: d("2099-12-31"), passportIssue: null, enFatherName: "", healthNotes: "<script>alert(1)</script>", agentId: agentBare.id });
  const p3 = await pil({ firstName: "ي".repeat(60), phone: "+9647701234567", passportType: "FOREIGN", passportNo: "XYZ123456789" });
  const pDel = await pil({ deletedAt: new Date() });
  const pMahram = await pil({ mahramId: pDel.id, mahramRelation: "زوج" });
  const b1 = await booking(p1.id, land.id, { priceAmount: null, roomType: null, agentId: agentGone.id }); // no price, no room type
  const b2 = await booking(p2.id, land.id, { tripHotelId: thNoPrice.id, roomType: "DOUBLE", priceAmount: 0 }); // hotel without prices
  const b3 = await booking(p3.id, land.id, { tripHotelId: th.id, roomType: "QUAD", priceAmount: 550, priceManual: true, noHousing: false, agentId: agent.id });
  const b4 = await booking(pMahram.id, land.id, { tripHotelId: th.id, roomType: "WEIRD_OLD_VALUE", priceAmount: 99999999, noHousing: true });
  const b5 = await booking(p0.id, arch.id, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "" }); // cancelled, on archived trip
  const bGoneTrip = await booking(pDel.id, gone.id);
  const p6 = await pil(); const b6 = await booking(p6.id, air.id, { transport: "FLIGHT", sarfByPilgrim: true, sarfAmount: 100, priceAmount: 1000, withFood: false });
  const p7 = await pil(); const b7 = await booking(p7.id, air.id, { transport: "CAR", priceAmount: 900, priceCurrency: "IQD" as never }); // CAR without car
  const p8 = await pil(); const b8 = await booking(p8.id, bare.id);
  const p9 = await pil(); const b9 = await booking(p9.id, land.id, { tripHotelId: th.id, roomType: "DOUBLE", priceAmount: 850, tripRole: "DRIVER" as never });

  // seats: valid, car without car record, flight
  await db.seatAssignment.create({ data: { bookingId: b3.id, busId: bus.id, seatNo: 1 } });
  await db.seatAssignment.create({ data: { bookingId: b9.id, busId: bus.id, seatNo: 99 } }); // seat number past the bus size
  await db.seatAssignment.create({ data: { bookingId: b6.id, flightId: flight.id } });
  await db.seatAssignment.create({ data: { bookingId: b7.id } }); // empty assignment row

  // families: group without head, head on a cancelled booking, group with one member
  const g1 = await db.familyGroup.create({ data: { label: null, kind: "FAMILY" } });
  await db.bookingGroupMember.create({ data: { bookingId: b3.id, groupId: g1.id, isHead: false } });
  await db.bookingGroupMember.create({ data: { bookingId: b4.id, groupId: g1.id, isHead: false } });
  const g2 = await db.familyGroup.create({ data: { label: "", kind: "COMPANIONS" } });
  await db.bookingGroupMember.create({ data: { bookingId: b9.id, groupId: g2.id, isHead: true } });
  await db.bookingGroupMember.create({ data: { bookingId: b5.id, groupId: g2.id, isHead: true } });
  await db.pilgrim.update({ where: { id: p3.id }, data: { familyGroupId: g1.id } });

  // office rooms: one with no code, one over capacity, an empty one
  const r1 = await db.officeRoom.create({ data: { tripId: land.id, tripHotelId: th.id, seq: 1, capacity: 2, category: "MEN", roomType: "DOUBLE" } });
  await db.officeRoomMember.create({ data: { officeRoomId: r1.id, bookingId: b3.id } });
  await db.officeRoomMember.create({ data: { officeRoomId: r1.id, bookingId: b4.id } });
  await db.officeRoomMember.create({ data: { officeRoomId: r1.id, bookingId: b9.id } }); // 3 in a room of 2
  await db.officeRoom.create({ data: { tripId: land.id, code: "a", seq: 7, capacity: 4, category: "FAMILY", note: "" } });

  // payments: refund, dinar without rate, huge, on a cancelled booking
  const pay = (bookingId: string, o: Record<string, unknown>) => db.payment.create({ data: { bookingId, amount: 100, currency: "USD", paidAt: d("2027-01-05"), receivedById: users.ADMIN, receivedByName: "x", ...o } as never });
  await pay(b3.id, {}); await pay(b3.id, { kind: "REFUND", amount: 50, reason: "" });
  await pay(b6.id, { currency: "IQD", amount: 1400000, exchangeRate: null }); await pay(b9.id, { amount: 2147483647 });
  await pay(b5.id, {}); await pay(b1.id, { source: "AGENT", sourceAgentId: agentGone.id });
  const payId = (await db.payment.findFirst())!.id;
  return { payId, users, bare, land, air, arch, gone, bus, b1, b3, p0, p1, g1, g2, agent, agentBare, mk, th, thNoPrice, car, flight, bGoneTrip };
}

/** Every route of the app with real ids, so the crawl opens each one. */
export function routes(s: Awaited<ReturnType<typeof seedHostile>>) {
  const trips = [s.bare, s.land, s.air, s.arch, s.gone];
  return [
    "/dashboard", "/pilgrims", "/pilgrims?f=expiring", "/pilgrims?f=noroom", "/pilgrims?f=noprice", "/pilgrims?sort=name&dir=asc", "/pilgrims?sort=expiry&dir=desc", "/pilgrims?sort=passport",
    "/pilgrims?q=" + encodeURIComponent("اسم"), "/pilgrims?q=A1000", "/pilgrims?room=a7", "/pilgrims?room=3", "/pilgrims?q=%00", "/pilgrims?trip=nope&agent=nope&sort=zzz&f=zzz",
    `/pilgrims?trip=${s.land.id}`, `/pilgrims?agent=${s.agent.id}`, `/pilgrims?saved=${s.p0.id}`, "/pilgrims?saved=not-an-id", "/pilgrims/new", `/pilgrims/new?trip=${s.land.id}`, "/pilgrims/new?trip=bad",
    `/pilgrims/${s.p0.id}`, `/pilgrims/${s.p1.id}`, "/pilgrims/does-not-exist",
    "/trips", "/trips?archive=1", "/trips?type=LAND", "/trips?type=AIR&q=%25", "/trips?q=%00", "/accounts?q=%00", "/accounts?tab=payments&q=%00", "/accounts?tab=payments&q=1", "/trips/new",
    ...trips.flatMap((t) => [`/trips/${t.id}`, `/trips/${t.id}/edit`, `/trips/${t.id}/prints`, `/trips/${t.id}/office-rooms`]),
    `/trips/${s.land.id}/bus/${s.bus.id}`, `/trips/${s.land.id}/bus/nope`, "/trips/not-an-id",
    `/bookings/${s.b1.id}`, `/bookings/${s.b3.id}`, "/bookings/nope",
    `/families/${s.g1.id}`, `/families/${s.g2.id}`, "/families/nope",
    "/accounts", "/accounts?q=اسم", "/accounts/pay", `/accounts/pay?booking=${s.b3.id}`,
    "/agents", `/agents/${s.agent.id}`, `/agents/${s.agentBare.id}`, "/agents/nope",
    "/hotels", "/programs", "/import", "/users", "/audit", "/settings", "/forbidden",
  ];
}
/** Output files and JSON endpoints — must answer 200 / 400 / 403 / 404, never 500. */
export function apiRoutes(s: Awaited<ReturnType<typeof seedHostile>>) {
  const per = (t: { id: string }) => [
    `/api/trips/${t.id}/office-rooms/print`, `/api/trips/${t.id}/candidates?q=اسم`, `/api/trips/${t.id}/candidates?q=`,
    ...["seat-map", "manifest", "haya", "flight-list", "tickets", "rooming-ar", "rooming-en"].flatMap((k) => [
      `/api/trips/${t.id}/outputs/${k}?bus=${s.bus.id}&format=pdf`, `/api/trips/${t.id}/outputs/${k}?bus=${s.bus.id}&format=xlsx`,
      `/api/trips/${t.id}/outputs/${k}?city=MAKKAH&format=pdf`, `/api/trips/${t.id}/outputs/${k}?city=MADINAH&format=xlsx`,
    ]),
  ];
  return [
    ...[s.land, s.air, s.bare, s.arch].flatMap(per),
    "/api/search?q=اسم", "/api/search?q=", "/api/search?q=%25", "/api/search?q=%00%00", "/api/search?q=%5C", `/api/trips/${s.land.id}/candidates?q=%00%00`, "/api/health",
    `/api/agents/${s.agent.id}/statement`, `/api/agents/${s.agent.id}/statement?format=xlsx`, `/api/agents/${s.agentBare.id}/statement`, `/api/agents/${s.agent.id}/statement?trip=${s.land.id}`,
    `/api/payments/${s.payId}/receipt`,
  ];
}
