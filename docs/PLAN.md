# PLAN — نظام إدارة المعتمرين والرحلات (أرض الملتقى)

Status: **plan only — no application code yet.** Awaiting approval before Phase 1.

## 1. Architecture

Single Next.js (App Router, TypeScript) monolith. No separate API service.

```
Browser (RTL Arabic, mobile) ──HTTPS──> Caddy ──> Next.js app ──> PostgreSQL
                                                     │
                                                     ├─> Storage adapter (local disk | S3)
                                                     └─> Playwright/Chromium (PDF rendering, in-process queue)
```

- **Mutations:** server actions, each wrapped by `withAuth(permission, handler)` which checks session + role on the server and writes audit rows in the same transaction.
- **Reads/downloads:** route handlers (`/api/documents/[id]`, `/api/trips/[id]/outputs/...`) — always authenticated and permission-checked; documents are streamed, never public URLs.
- **Domain logic** lives in `src/domain/*` as pure functions (no DB, no Next imports) so every rule in `<business_rules>` is unit-testable: passport-expiry, mahram, rooming, seating, readiness, capacity.
- **Auth:** Auth.js credentials + argon2 hashes + TOTP (otplib), enforced at login; absolute + idle session timeout; login rate limiting.
- **Permissions:** one static matrix `role → permission[]` in `src/lib/permissions.ts`; used by both UI (hide) and server (enforce). Middleware blocks unauthenticated; each action/route checks its permission.
- **Audit:** Prisma client extension records old/new values for audited models (Pilgrim names, passport fields, Booking price, Payment) — central, so no action can forget it.
- **Money:** integer minor units + currency column per amount (IQD has 0 decimals; USD cents).
- **Time:** store UTC; format with `Asia/Baghdad`, `DD/MM/YYYY`; date-only fields (DOB, passport dates, trip dates) stored as `DATE`.
- **Outputs:** one data function per output returns a typed view-model; two renderers consume it — HTML→PDF (Arabic font bundled, e.g. Noto Naskh/Cairo, `dir=rtl`) and ExcelJS (RTL sheet view). Company header from `Settings`.
- **Partner export:** `ExportTemplate` + `ExportTemplateColumn` rows (header text, source path like `pilgrim.passport.number`, transform, order). A small engine resolves paths against a flattened booking view-model. Swapping the real template = editing DB rows (ADMIN screen / JSON import), no code.
- **Import wizard:** upload → store temp file → sheet pick → column mapping (saved `ImportMapping`) → dry-run validation producing row results → duplicate resolution by passport number → commit in one transaction → error report .xlsx.
- **Deployment:** Docker Compose: `app`, `db` (Postgres 16), `caddy` (auto HTTPS), `backup` (cron container: `pg_dump` + documents tar, encrypted with `age`, copied to a second location via rclone). README documents restore.

## 2. Schema (ER summary)

UUID PKs, `createdAt/updatedAt` everywhere; `deletedAt` on Pilgrim, Agent, Hotel, Trip, Booking.

| Entity | Key fields / relations |
|---|---|
| User | email, passwordHash, role, totpSecret(enc), totpEnabled, active |
| Setting | key/value JSON (company info, `passportMinMonths`=6, `mahramRule`, currencies, etc.) |
| Agent | name, officeName, phones[], address, commissionType(PERCENT\|FIXED_WHOLESALE), commissionValue |
| Pilgrim | Arabic name parts + familyName, gender, dob, motherName, governorate, address, phone, emergencyPhone, passportNo **UNIQUE**, en given/father/grandfather/surname, nationality, placeOfBirth, passportIssue/Expiry/Authority, mahramId→Pilgrim? (optional, no mahram is a normal case), mahramRelation?, familyGroupId?, flags (chronic, wheelchair, elderly), notes, agentId? |
| FamilyGroup | id, label, kind(FAMILY\|COMPANIONS) — COMPANIONS = «عصبة»: unrelated pilgrims (e.g. 4 women, no mahram) housed/seated together; linked at rooming time, not at registration |
| BookingGroupMember | bookingId, groupId — per-trip membership, so the same woman can be in different عصبة on different trips |
| PilgrimDocument | pilgrimId, type(PASSPORT\|PHOTO\|NATIONAL_ID\|OTHER), storageKey, mime, size |
| Hotel | officialName, localName, city(MAKKAH\|MADINAH), address, tourismLicenseNo, mealsIncluded |
| HotelContract | hotelId, nusukContractNo, startDate, endDate; **HotelContractRoomType**: roomType, roomsContracted |
| Program | name, programType, transportType, nightsMakkah, nightsMadinah, hotels, **ProgramPrice**(roomType, currency, amount) |
| Trip | tripNo, programType(UMRAH\|HAJJ-ready enum), transportType, name, departDate, returnDate, nightsMakkah/Madinah, makkahHotelId, madinahHotelId, capacity, supervisorId→User, status |
| Bus | tripId, number, driverName/Phone, company, seatCount; **BusSeat** via SeatAssignment |
| Flight | tripId, flightNo, airline, departAt, arriveAt, ticketCount; **GroundCar**(tripId, driver, phone, capacity) |
| Booking | pilgrimId, tripId, roomType, price+currency, agentId, status(ACTIVE\|CANCELLED\|MOVED), movedFromBookingId?, UNIQUE(pilgrimId, tripId) |
| Visa | bookingId 1:1, status, visaNo, issue/expiry, pdf documentKey, nusukGroupNo, saudiCompany, externalAgent |
| Room | tripId, hotelId, city, roomNo, type(DOUBLE..QUINT), bedCapacity |
| RoomAssignment | roomId, bookingId, checkIn, checkOut, UNIQUE(roomId, bed index) |
| SeatAssignment | LAND: busId, seatNo, bookingId (UNIQUE busId+seatNo, UNIQUE booking) ; AIR: ticketNo/PNR, groundCarId |
| Payment | bookingId, amount, currency, method, paidAt, receivedById, receiptNo (sequence), kind(PAYMENT\|REFUND), reason? |
| AuditLog | userId, entity, entityId, field, oldValue, newValue, at |
| ExportTemplate / Column | name, active; columns(order, header, sourcePath, transform) |
| ImportMapping | name, target, mapping JSON |

"Ready to travel" is **derived** (not stored): required docs present ∧ visa.status = ISSUED ∧ booking ACTIVE.

## 3. Folder structure

```
prisma/            schema.prisma, migrations/, seed.ts
src/app/           (auth)/login, (app)/dashboard|pilgrims|trips|hotels|agents|programs|import|settings|users|audit, api/
src/domain/        passport.ts mahram.ts rooming.ts seating.ts readiness.ts capacity.ts  (+ *.test.ts)
src/server/        db.ts auth.ts permissions.ts audit.ts storage/ actions/
src/outputs/       viewmodels/, pdf/ (html templates + renderer), xlsx/, partner-export/
src/import/        parser, mapper, validator, committer
src/components/    ui/, rtl-aware form fields
e2e/               Playwright flows
docs/              PLAN.md ASSUMPTIONS.md
deploy/            docker-compose.yml Caddyfile backup/
```

## 4. Phase 1 task list

1. Scaffold Next.js+TS+Tailwind RTL, ESLint, Vitest, Prisma, Docker dev DB; CI script `npm test`.
2. Schema + initial migration for Phase 1 entities (User, Setting, Agent, Pilgrim, FamilyGroup, PilgrimDocument, Trip, Bus, Flight, GroundCar, Booking, SeatAssignment, AuditLog, ImportMapping).
3. Auth: login, argon2, TOTP enrol/verify, session timeout, rate limit, roles + permission matrix, `withAuth`.
4. Audit extension + viewer screen (ADMIN).
5. Storage adapter + authenticated document route; image compression (sharp), size limit; mobile camera upload.
6. Pilgrims: create/edit/list/search (passport, Arabic, English, phone); validation (Iraqi phone, unique passport with Arabic error); profile page.
7. Agents CRUD.
8. Trips (land/air), buses, flights, ground cars; link pilgrims (bookings without pricing yet); capacity counter.
9. Bus seat map with family-adjacency check; ticket/PNR entry for air.
10. Outputs: bus manifest + flight list as PDF and XLSX (Arabic shaping verified).
11. Import wizard (parse, map, preview, duplicates, transactional commit, error report).
12. Domain rules + tests: passport expiry warning, mahram warning (settings-driven), capacity, seating.
13. Seed script (Mosul data, 1 land convoy/2 buses, 1 air trip, 3 agents; hotels seeded as plain rows for Phase 2).
14. Playwright e2e for the five acceptance criteria; README draft; phase summary.

## 5. Later phases (unchanged from brief)
Phase 2 operations, Phase 3 money, Phase 4 only on request.

## 6. Change log
- Women without a mahram are a normal case: the mahram warning is a setting, **off by default**.
- Added «عصبة» (companion group): per-trip, created from the rooming board or trip page by selecting bookings; rooming auto-assign and bus seating treat a عصبة exactly like a family (same room, adjacent seats). Gender separation rule allows same-gender عصبة; it never forces mixing.
