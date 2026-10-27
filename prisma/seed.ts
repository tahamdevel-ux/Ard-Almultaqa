import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const db = new PrismaClient();
const d = (s: string) => new Date(s + "T00:00:00Z");
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

const MALE_FIRST = ["محمد", "أحمد", "علي", "حسين", "عمر", "يوسف", "خالد", "إبراهيم", "مصطفى", "سعد", "ياسر", "ثامر"];
const FEMALE_FIRST = ["فاطمة", "زينب", "مريم", "عائشة", "سارة", "نور", "هدى", "أسماء", "رقية", "خديجة"];
const EN: Record<string, string> = { محمد: "MOHAMMED", أحمد: "AHMED", علي: "ALI", حسين: "HUSSEIN", عمر: "OMAR", يوسف: "YOUSIF", خالد: "KHALID", إبراهيم: "IBRAHIM", مصطفى: "MUSTAFA", سعد: "SAAD", ياسر: "YASIR", ثامر: "THAMER", فاطمة: "FATIMA", زينب: "ZAINAB", مريم: "MARYAM", عائشة: "AISHA", سارة: "SARA", نور: "NOOR", هدى: "HUDA", أسماء: "ASMAA", رقية: "RUQAYA", خديجة: "KHADIJA" };
const FAMILIES: [string, string][] = [["الجبوري", "ALJUBOURI"], ["العبيدي", "ALOBAIDI"], ["الحمداني", "ALHAMDANI"], ["الطائي", "ALTAI"], ["الدليمي", "ALDULAIMI"], ["السبعاوي", "ALSABAWI"], ["النعيمي", "ALNUAIMI"]];

async function main() {
  const pw = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
  const admin = await db.user.upsert({ where: { username: "admin" }, update: {}, create: { username: "admin", name: "مدير النظام", role: "ADMIN", passwordHash: await hash(pw) } });
  await db.user.upsert({ where: { username: "reg" }, update: {}, create: { username: "reg", name: "موظف التسجيل", role: "REGISTRATION", passwordHash: await hash(pw) } });
  await db.user.upsert({ where: { username: "housing" }, update: {}, create: { username: "housing", name: "موظف التسكين", role: "HOUSING", passwordHash: await hash(pw) } });
  await db.user.upsert({ where: { username: "acc" }, update: {}, create: { username: "acc", name: "المحاسب", role: "ACCOUNTANT", passwordHash: await hash(pw) } });
  const sup = await db.user.upsert({ where: { username: "sup" }, update: {}, create: { username: "sup", name: "المشرف أبو عمر", role: "SUPERVISOR", passwordHash: await hash(pw) } });

  await db.setting.upsert({ where: { key: "company" }, update: {}, create: { key: "company", value: { name: "شركة أرض الملتقى للحج والعمرة", address: "الموصل - حي الزهراء", phones: "07701234567 - 07801234567" } } });

  if ((await db.agent.count()) === 0) {
    await db.agent.createMany({ data: [
      { name: "أبو بكر الموصلي", officeName: "مكتب النور للسياحة", phones: ["07701112233"], commissionType: "PERCENT", commissionValue: 5 },
      { name: "حسام العبيدي", officeName: "مكتب الرافدين", phones: ["07509998877"], commissionType: "FIXED_WHOLESALE", commissionValue: 450000 },
      { name: "سلوى الطائي", officeName: "مكتب البشائر", phones: ["07712223344"], commissionType: "PERCENT", commissionValue: 7 },
    ] });
  }
  const agents = await db.agent.findMany();

  if ((await db.pilgrim.count()) === 0) {
    for (let i = 0; i < 40; i++) {
      const female = i % 3 === 0;
      const first = (female ? FEMALE_FIRST : MALE_FIRST)[i % (female ? FEMALE_FIRST.length : MALE_FIRST.length)];
      const father = MALE_FIRST[(i + 3) % MALE_FIRST.length], grand = MALE_FIRST[(i + 7) % MALE_FIRST.length];
      const [fam, famEn] = FAMILIES[i % FAMILIES.length];
      await db.pilgrim.create({ data: {
        firstName: first, fatherName: father, grandfatherName: grand, familyName: fam,
        gender: female ? "FEMALE" : "MALE", birthDate: d(`${1950 + (i % 40)}-0${1 + (i % 9)}-1${i % 9}`),
        motherName: FEMALE_FIRST[(i + 2) % FEMALE_FIRST.length], governorate: "نينوى", address: "الموصل",
        phone: `0770${String(1000000 + i * 7919).slice(0, 7)}`, emergencyPhone: `0750${String(2000000 + i * 4231).slice(0, 7)}`,
        passportNo: `A${String(10000000 + i * 137)}`, enGivenName: EN[first], enFatherName: EN[father], enGrandfatherName: EN[grand], enSurname: famEn,
        placeOfBirth: "MOSUL", passportIssue: d("2022-03-15"), passportExpiry: d(i % 10 === 0 ? "2027-01-20" : "2030-03-14"), passportAuthority: "MOSUL",
        agentId: agents[i % agents.length].id, elderly: i % 7 === 0, wheelchair: i % 13 === 0,
      } });
    }
  }
  const pilgrims = await db.pilgrim.findMany({ orderBy: { passportNo: "asc" } });

  if ((await db.trip.count()) === 0) {
    const land = await db.trip.create({ data: { tripNo: "L-2611", name: "عمرة بري - قافلة الأحد", transportType: "LAND", departDate: d("2026-11-15"), returnDate: d("2026-11-27"), nightsMakkah: 6, nightsMadinah: 4, capacity: 90, supervisorId: sup.id } });
    const b1 = await db.bus.create({ data: { tripId: land.id, number: "1", driverName: "جاسم محمد", driverPhone: "07705554433", company: "شركة الفرات للنقل", seatCount: 48 } });
    await db.bus.create({ data: { tripId: land.id, number: "2", driverName: "رعد سالم", driverPhone: "07715556677", company: "شركة الفرات للنقل", seatCount: 48 } });
    const air = await db.trip.create({ data: { tripNo: "A-2612", name: "عمرة جوي - كركوك", transportType: "AIR", departDate: d("2026-12-05"), returnDate: d("2026-12-15"), nightsMakkah: 5, nightsMadinah: 4, capacity: 40 } });
    await db.flight.create({ data: { tripId: air.id, flightNo: "IA 441", airline: "الخطوط الجوية العراقية", departAt: new Date("2026-12-05T06:30:00+03:00"), arriveAt: new Date("2026-12-05T09:15:00+03:00"), ticketCount: 40 } });
    await db.groundCar.create({ data: { tripId: air.id, label: "سيارة 1", driverName: "ماهر يونس", driverPhone: "07708887766", capacity: 7 } });
    for (const p of pilgrims.slice(0, 30)) await db.booking.create({ data: { pilgrimId: p.id, tripId: land.id, agentId: p.agentId, visaStatus: "ISSUED", visaNo: `V${p.passportNo.slice(1)}` } });
    for (const p of pilgrims.slice(30, 40)) await db.booking.create({ data: { pilgrimId: p.id, tripId: air.id, agentId: p.agentId } });
    const women = await db.booking.findMany({ where: { tripId: land.id, pilgrim: { gender: "FEMALE" } }, take: 4 });
    const g = await db.familyGroup.create({ data: { kind: "COMPANIONS", label: "عصبة" } });
    await db.bookingGroupMember.createMany({ data: women.map((b) => ({ bookingId: b.id, groupId: g.id })) });
    await db.setting.upsert({ where: { key: "passportMinMonths" }, update: {}, create: { key: "passportMinMonths", value: 6 } });
  }
  if ((await db.hotel.count()) === 0) {
    const mk = await db.hotel.create({ data: { officialName: "Almassa Dar Al Khairat", localName: "رمادا", city: "MAKKAH", address: "مكة المكرمة - أجياد", licenseNo: "MK-1042" } });
    const md = await db.hotel.create({ data: { officialName: "Dar Al Taqwa Hotel", localName: "دار التقوى", city: "MADINAH", address: "المدينة المنورة - المركزية", licenseNo: "MD-2231" } });
    await db.hotel.create({ data: { officialName: "Swissotel Al Maqam", localName: "سويس مقام", city: "MAKKAH", address: "مكة المكرمة - أبراج البيت" } });
    await db.hotel.create({ data: { officialName: "Anwar Al Madinah Movenpick", localName: "موفنبيك الأنوار", city: "MADINAH", address: "المدينة المنورة" } });
    for (const t of await db.trip.findMany()) await db.trip.update({ where: { id: t.id }, data: { makkahHotelId: mk.id, madinahHotelId: md.id } });
    await db.user.update({ where: { username: "sup" }, data: { phone: "07705551212" } });
    const land = await db.trip.findFirstOrThrow({ where: { tripNo: "L-2611" } });
    const mkRooms = [["DOUBLE", 2, 5], ["TRIPLE", 3, 5], ["QUAD", 4, 10]] as const;
    for (const city of ["MADINAH", "MAKKAH"] as const) {
      let n = 1;
      for (const [type, beds, count] of mkRooms) for (let i = 0; i < count; i++) await db.room.create({ data: { tripId: land.id, hotelId: city === "MAKKAH" ? mk.id : md.id, city, roomNo: String(100 * (city === "MAKKAH" ? 5 : 3) + n++), type, beds } });
    }
    await db.program.create({ data: { name: "عمرة بري - قافلة الأحد", transportType: "LAND", nightsMakkah: 6, nightsMadinah: 4, firstCity: "MADINAH", makkahHotelId: mk.id, madinahHotelId: md.id, capacity: 90, busCount: 2, seatsPerBus: 48, durationDays: 12 } });
    await db.program.create({ data: { name: "عمرة جوي - كل 10 أيام", transportType: "AIR", nightsMakkah: 5, nightsMadinah: 4, firstCity: "MADINAH", makkahHotelId: mk.id, madinahHotelId: md.id, capacity: 40, durationDays: 10 } });
  }
  console.log("seeded; admin password:", pw, "admin id:", admin.id);
}
main().finally(() => db.$disconnect());
