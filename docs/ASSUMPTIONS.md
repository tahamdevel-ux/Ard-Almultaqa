# ASSUMPTIONS

Simplest option chosen where the brief is silent. Flag any you want changed.

1. **Stack:** default stack from the brief, unchanged. Node 20+, Postgres 16, Prisma.
2. **Hosting:** one VPS running Docker Compose; Caddy for HTTPS (auto Let's Encrypt). Domain supplied by the company.
3. **Password hashing:** argon2id. Login is username + password only. TOTP is **optional and off by default** (an ADMIN can enable it per user later); login rate limiting and session timeout still apply.
4. **Session:** 30 min idle / 12 h absolute timeout, configurable in settings.
5. **Roles:** one role per user. SUPERVISOR sees only trips where they are the assigned supervisor.
6. **Phone format:** `^07[3-9]\d{8}$` for Iraqi mobiles (validated, normalised); emergency contact uses the same rule, with a looser international fallback.
7. **Money:** IQD default; amounts stored as integers in minor units plus a currency code; no automatic FX conversion (each amount keeps its own currency). Phase 3.
8. **Mahram rule:** women travelling without a mahram is normal for the company, so the warning is **off by default**. If enabled in settings it is a non-blocking warning, and a woman in a عصبة (companion group) is exempt.
8b. **عصبة (companion group):** unrelated pilgrims (typically ~4 women) housed and seated together. Membership is per trip and set at rooming/trip time, not at registration. Treated like a family by auto-assign and seat adjacency.
9. **Passport expiry warning:** expiry < return date + N months (default 6).
10. **Soft delete** for Pilgrim, Agent, Hotel, Trip, Booking; unique passport applies across soft-deleted rows too (restoring is the right way to reuse).
11. **Documents:** JPEG/PNG/PDF; images resized to max 2000 px long edge and re-encoded (sharp); max 8 MB before compression; stored under random keys, served only via `/api/documents/[id]` after a permission check. Virus scanning out of scope.
12. **Bookings in Phase 1:** a minimal Booking (pilgrim × trip, status, agent, room type optional, no price) exists so seats/manifests work; pricing and payments arrive in Phase 3 without schema rework.
13. **Seat map:** standard 2+2 bus layout, seat count per bus configurable; air trips use ticket/PNR text, no seat map.
14. **Names on manifests:** English name printed exactly from the four passport name fields.
15. **PDF:** A4, generated server-side through headless Chromium with a bundled Arabic font (Noto Naskh Arabic + Noto Sans for Latin) so it works offline in Docker.
16. **Excel:** import accepts `.xlsx` only (not `.xls`/CSV) up to 5 MB / 5,000 rows per run. Exports use RTL sheet view.
17. **Partner template:** placeholder with columns for passport data, DOB, gender, mahram, Nusuk group no.; real layout later = DB edit.
18. **Backups:** daily `pg_dump` + tar of documents, encrypted with `age`, kept 14 days locally and copied via rclone to a second location (S3-compatible bucket or another server). Restore tested once with a script in `deploy/backup/`.
19. **Languages:** UI Arabic only; English appears only in passport fields and hotel-facing outputs.
20. **Hajj:** `programType` enum includes only `UMRAH` now; adding `HAJJ` is an enum migration plus program-specific rules, no table changes.
21. **Nusuk:** no integration; only stored numbers and Excel export.
22. **Time zone:** all display in `Asia/Baghdad`; trip dates are plain dates (no time zone).

## Decisions that are expensive to reverse — please confirm
- **A.** (resolved) Hosting: company VPS with Docker Compose.
- **B.** (resolved) No mandatory 2FA; username + password.
- **C.** (resolved) Mahram warning off by default; عصبة supported.
- **C2.** (resolved) Max عصبة size is 4, so it always fits one quad room. The limit is a setting (default 4); rooming still warns if a group is larger than the largest room.
- **D.** (resolved) A pilgrim cannot be on two trips at once: warn only when date ranges actually overlap. Back-to-back trips (leaves on one, returns, then goes on the next) are normal and not flagged. The same overlap rule applies to the trip supervisor.

## Deviations from PLAN.md made during Phase 1
- **Auth:** custom DB-backed sessions (httpOnly cookie, sha-256 token hash, idle/absolute timeout, login lockout) instead of Auth.js — simpler and gives instant revocation. TOTP via `otplib` is implemented but off by default.
- **Audit:** an explicit `auditChanges()` helper called inside the same transaction as each pilgrim update/import update, instead of a Prisma extension. Booking/payment auditing arrives with Phase 3.
- **Groups:** companion/family seating groups are per-trip `BookingGroupMember` rows created from the trip page.
- **Versions:** Next 15.5, Prisma 6.19, otplib 12, TypeScript 5.9.

## Phase 2 decisions
- **No Nusuk contracts:** no HotelContract table, no "no housing without contract" rule, no contracted-beds warnings. The partner Excel export is deferred with them.
- **Rooms** are created per trip and city from the trip's hotel; the bed warning compares real beds with booked pilgrims.
- **Stay dates** are computed from departure date, nights per city and which city is first (`Trip.firstCity`, default Madinah).
- **Rooming rule:** a man and a woman may share a room only if they share a family/عصبة group on that trip. Drag-and-drop and the select fallback both go through the same server check.
- **Templates (`Program`)** copy name, transport, nights, hotels, capacity and bus count; prices come with Phase 3.
- **Supervisor phone** is stored on the user and printed on ID cards.

## Phase 3 decisions (money)
- **Pricing:** one price per room type per trip (not per agent), in USD; staff can override the price of a single booking. Prices are whole dollars.
- **Currency:** a booking is priced in USD. The pilgrim may pay in dinars: each payment stores the original amount, the exchange rate typed at payment time (dinars per dollar) and the dollar value credited. The balance is always shown in the booking currency. `usdRate` in settings is only a suggestion pre-filled in the form (default 1400 — change it).
- **Guards:** a payment cannot exceed the remaining balance (catches typos); a refund needs a reason and cannot exceed what was paid; payments need a price on the booking; no payments on cancelled/moved bookings.
- **Receipts:** sequential integer (`Payment.receiptNo`, database sequence). A rolled-back insert can leave a gap in the numbering; receipts are never deleted.
- **Cancellation:** requires a reason, frees seat and rooms, optionally records a refund; unrefunded money stays with the company.
- **Move to another trip:** creates a new booking on the target trip carrying price and visa data, re-points the payments to it, and keeps the old booking as `MOVED` (history).
- **Agent statement:** PERCENT = commission is that % of the price; FIXED_WHOLESALE = the company price per pilgrim is the fixed value and the agent keeps the difference. Due to company = price − commission − net money received. Cancelled bookings add no price/commission.
- **Audit:** price/room type changes and every payment (amount, currency, rate, credited value, receipt no.) are written to the audit log.
- **Who:** only ADMIN and ACCOUNTANT see or edit prices and payments; moving a pilgrim between trips needs `bookings.write` (ADMIN/REGISTRATION).

## Optional trip fields (branch claude/optional-trip-fields)
- **Trip code (رقم الرحلة), departure date (تاريخ الذهاب) and return date (تاريخ العودة) are optional**, for land and air trips. Empty input is stored as `NULL` (migration `optional_trip_fields`), never as an empty string. No warning, reminder or block appears when they are empty.
- **Unique only when filled:** `Trip.tripNo` keeps its unique index; PostgreSQL allows many `NULL`s.
- **Still validated:** a filled date must be DD/MM/YYYY, and when both dates are filled the return cannot be before the departure (`parseTripIdentity`, server side).
- **Skipped silently for trips missing dates:** passport-expiry warning (no return date) and the overlapping-trips warning (either date missing).
- **Display:** lists sort undated trips after dated ones; an uncoded trip is shown by its name (`tripLabel`); a missing date prints "غير محدد" on screens and is left out of printed header lines (`joinMeta`).
- **Editing:** the trip page has a small form to fill or clear the three fields; each change is written to the audit log (entity `Trip`).
- **Not changed:** flight and ticket numbers, every other date, other validation rules and permissions.

## UX batch (branches claude/ux-dates-booking-search → claude/ux-buses → claude/ux-smart-import)
- **Dates:** every DD/MM/YYYY input adds the slash while typing (`DateInput`, `src/domain/dateMask.ts`).
- **Trips for a pilgrim:** a new pilgrim must be saved with ≥1 trip (atomic); the profile has "إضافة لرحلة" (multi-select). Overlapping dates are always allowed (warning only); the same trip twice is skipped.
- **Search:** header live search over pilgrims (AR/EN name, passport, phone), trips, agents, hotels; Arabic-normalised; supervisors only see pilgrims/trips of their own trips.
- **Trip page popup:** "إضافة معتمر" searches by name/passport/phone, shows his other/previous trips, adds to this trip only.
- **Buses (land):** bus 1 opens with the trip; a new booking takes the lowest free seat of the first *unnamed* bus; when all unnamed buses are full the next numbered bus opens (same seat count). A bus with a name (`Bus.name`) is manual and never auto-filled. Deleting a bus with pilgrims is refused ("انقل المعتمرين أولاً"); pilgrims move between buses in bulk, groups together. Air trips unchanged.
- **Import:** a trip is chosen at import time. Header row, sheet and columns are detected automatically (header text first, then cell content); full names are split; dates/gender/nationality/phones are normalised; near-empty rows are ignored; an invalid phone is dropped with a note instead of blocking the pilgrim. Passports already registered are added to the chosen trip without changing their data (option: update data, or skip); those already on the trip are skipped. Visa number, mahram/relation, group, age, client, hotel/room and E-number columns are ignored. No external AI service is used.

## UX batch 2
- **Pilgrim form:** one "الاسم الثلاثي" box (first, father, grandfather; compound names like "عبد الله" kept together) + surname box; English names stay as separate boxes. A two-word name is accepted (grandfather empty); one word is rejected. Phone: digits only, hard limit 11.
- **Trips list:** edit (name, code, dates, capacity, status, nights, supervisor; transport type fixed) and delete. Delete is always allowed: the trip is soft-deleted, its active bookings are cancelled ("حذف الرحلة"), payments stay in the records; audited.
- **Pilgrims list:** grouped by trip with a divider (name, dates, count); a pilgrim on two trips shows under both; "بدون رحلة" last.
- **Family head:** every FAMILY group has one head (`BookingGroupMember.isHead`). Each member keeps his own booking and price; `/families/:groupId` shows the sum. A family payment is split over the members' bookings (head first, each up to what he owes), each member getting his own receipt. Family groups are not limited to the companion-group size.
- **Accommodation:** when adding a pilgrim to a trip (popup) and from the trip row, set his own hotel per city (default = the trip's hotel), room type and room number; the room is created in that hotel if new; refused if the room belongs to another hotel/type, is full, or mixes men and women outside a shared group. Room type also sets the trip's price when the booking has none. Auto-assign on the rooming board respects each pilgrim's chosen hotel.

## Nov 2026 change batch (branch feat/nov-2026-changes)
- **C1 trip code/dates optional:** already implemented (migration `optional_trip_fields`); verified by `e2e/phase4`, `src/server/trips-optional.test.ts`; no gap found.
- **C2 removed:** visas (UI, actions, dashboard, outputs), document uploads and the document route, the pilgrim ID card, the missing-items list; database columns/tables and the storage volume are kept. "Ready to travel" = active booking **and** passport number entered (`src/domain/readiness.ts`). The `documents.*` permissions are gone from the matrix.
- **C3 passport/phone:** `Pilgrim.passportType` (IRAQI default, FOREIGN). Passport is normalized (spaces, Arabic/Persian digits, uppercase) and stored normalized; Iraqi `^[A-Z][0-9]{8}$`, foreign `^[A-Z0-9]{6,12}$`; choosing FOREIGN is audited. Phones (pilgrim, emergency, agent, driver, car, supervisor, company): Iraqi `07` + 9 digits or Saudi `05` + 8 digits, `+964/00964/+966/00966` become `0`; stored normalized. The old "11 digits only" input limit was replaced by this (a `+964…` number is longer while typing). In the import an invalid phone is dropped with a note (the pilgrim is still imported) and Excel's missing leading zero is restored.
- **C4 save buttons:** `حفظ` returns to the list as left (`returnTo`, internal paths only), toast + 3 s row highlight; `حفظ وإضافة جديد` opens an empty form that keeps the trip(s) and agent. A failed save keeps everything typed.
- **C5 trip order:** `TRIP_ORDER` = `createdAt desc, id desc` is the only order in lists/pickers/dashboard/pilgrims list. This **replaces** the earlier "undated trips last / by departure date" ordering.
- **C6 accounts:** `/accounts` (all roles). Due = prices of ACTIVE bookings; received = payments − refunds of ACTIVE and CANCELLED bookings (what the company kept stays received); remaining = due − received. Money is USD (bookings are priced in USD). Period filter by trip creation date (cards, trips, pilgrims, agents) and by payment date (log). Payment `source` DIRECT/AGENT (+ agent required). Agents tab: "via agent" = AGENT payments naming that agent; "direct" = DIRECT payments on that agent's bookings; remaining = due − everything paid on his bookings. Permissions: every role views and records payments (`payments.view`, `payments.record`); refunds/cancel and price edits stay with ADMIN and ACCOUNTANT (`payments.write`, `prices.write`). There is no "edit/void payment" feature today, so none was added; refunds (reason required, audited) are the way to reverse money. This replaces the rule that REGISTRATION/HOUSING/SUPERVISOR cannot see prices and payments.
- **C7 office rooms:** `SINGLE` (سنكل, 1 bed) everywhere room types are used (the import has no room-type column, so nothing to add there). `Agent.roomCode` (1–2 lowercase letters, unique, optional, set on the agents page). `OfficeRoom` / `OfficeRoomMember`, unique `(trip, code, seq)` also for plain numbers. Automatic assignment on new/reactivated bookings, imports (at the end, same transaction), trip moves; a cancelled booking frees its bed and the room keeps its number; gender/room-type changes only raise the warning `الغرفة لا تناسب المعتمر`. Agents are kept apart by "segment": one agent on air trips, one single-agent bus on land trips (mixed bus = plain numbers). An empty room is reused only by someone who gets the same label prefix. Default capacity setting `officeRoomCapacity` (4). Permissions: ADMIN/REGISTRATION/HOUSING view and edit, SUPERVISOR views (own trips), ACCOUNTANT none; renumber is ADMIN only. The internal print (`/api/trips/:id/office-rooms/print`, A4 landscape, 18 slots, slot 18 = summary) is the only output with office room data; `src/officeRooms/leak.test.ts` fails if any other output (or its view-model) mentions a room, or if `src/outputs` imports office room code.
- **Choosing the office room when adding a pilgrim:** an optional "غرفة المكتب الداخلية" field (e.g. `1` or `a3`) in the add-pilgrim popup, the new-pilgrim page, the profile "add to trips" and the trip-row editor. Empty = automatic. A typed label puts the pilgrim in that room (created if missing; MANUAL placement), so everyone given `1` is together; a full or locked room is refused and nothing is saved. A room someone was put in by hand keeps its label.

## v2 batch (same branch feat/nov-2026-changes; Hay'a files received 10 Nov)
- **C2 (v2):** governorate removed (column kept); the hotel rooming board and its auto-assign are gone — office rooms are the only rooming. The hotel rooming *outputs* and the accommodation fields built earlier stay until C6/C8/C9.4 replace them.
- **C3 (v2):** passport box hard limit 9 (Iraqi) / 12 (foreign); phone boxes keep at most 11 digits after normalising pasted values (`+964…`, Arabic digits). Mother's name required, Arabic surname optional (stored as empty). Role per bus (`متعهد/سايق/مساعد سايق`) is a select (one value per pilgrim) on the booking: one of each per bus is enforced when set, when seated by hand and when moved between buses; air trips (no bus) are unrestricted.
- **C4 (v2):** Enter = "حفظ وإضافة جديد" (not in notes boxes). The new form keeps trip(s), agent, hotel, room type (and food / تصريف when they exist) through a `keep` parameter; personal fields are empty. "رب الأسرة" checkbox and "تابع لرب أسرة" picker per trip (reusing the FAMILY group + head), a third button "حفظ وإضافة فرد للعائلة" links the next pilgrim to the head just saved. Head tag 🏠 next to names (pilgrims list, trip list, office rooms, search). Changing a pilgrim's agent moves his active bookings (commission follows), is audited, and a coded office room whose agent no longer fits only shows the warning.
- **C5 (v2):** `Trip.archivedAt` (migration `trip_archive`). Archive: ADMIN and ACCOUNTANT (`trips.archive`), unarchive: ADMIN only; both audited. Archived trips are hidden from the trips list (filter «الأرشيف»), every picker, dashboard, search and the add-pilgrim flows; they stay in accounts (with a «إخفاء الرحلات المؤرشفة» filter). An archived trip opens read-only (write controls hidden; trip edit, accommodation and add-pilgrim refuse on the server; other trip actions are only hidden in the UI). In a trip: agent column (name as stored), a 📝 icon with the pilgrim's notes (the pilgrim's health notes, visible to roles that see health data) and a «لديهم ملاحظات» filter; one debounced search box over names (AR/EN), mother, passport, phone, agent, hotel and office room label (Arabic digits and case ignored).
