# ASSUMPTIONS

Simplest option chosen where the brief is silent. Flag any you want changed.

1. **Stack:** default stack from the brief, unchanged. Node 20+, Postgres 16, Prisma.
2. **Hosting:** one VPS running Docker Compose; Caddy for HTTPS (auto Let's Encrypt). Domain supplied by the company.
3. **Password hashing:** argon2id. TOTP is mandatory for every user (no opt-out); 10 recovery codes issued at enrolment.
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
- **A.** Hosting target: your own VPS with Docker Compose (assumed) vs. a managed platform.
- **B.** Mandatory TOTP for all ~10 staff (assumed yes).
- **C.** (resolved) Mahram warning off by default; عصبة supported.
- **C2.** Max size of a عصبة (assumed no limit; rooming splits by room capacity, e.g. 4 = quad room)?
- **D.** Is the same pilgrim ever on two trips at the same time? (Assumed no: warn on overlapping dates.)
