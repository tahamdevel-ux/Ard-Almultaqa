# أرض الملتقى — نظام إدارة المعتمرين والرحلات

نظام داخلي لشركة أرض الملتقى للحج والعمرة (الموصل). كل معتمر يُدخل مرة واحدة، ومنه تُولَّد كشوف الباصات وقوائم الطيران.
الخطة والافتراضات: `docs/PLAN.md`, `docs/ASSUMPTIONS.md`.

**الحالة:** المرحلة 1 (الأساس) مكتملة. المراحل 2–3 (الفنادق والتسكين، الدفعات) لم تبدأ.

## Setup (development)

Requirements: Node 22, PostgreSQL 16.

```bash
cp .env.example .env            # edit DATABASE_URL / APP_SECRET
npm install
npx prisma migrate deploy       # or: npm run db:migrate
npm run db:seed                 # demo data (Mosul)
npm run dev                     # http://localhost:3000
```

Seed users (password from `SEED_ADMIN_PASSWORD`, default `ChangeMe123` — **change it**):
`admin`, `reg` (تسجيل), `housing`, `acc` (محاسب), `sup` (مشرف).

PDFs use headless Chromium through Playwright. If it is missing: `npx playwright install chromium`
(or set `CHROMIUM_PATH`).

## Tests

```bash
createdb ard_test && DATABASE_URL=postgresql://ard:ard@localhost:5432/ard_test npx prisma migrate deploy
npm test          # unit + DB integration (uses TEST_DATABASE_URL, default .../ard_test)
npm run e2e       # Playwright; starts `npm run dev` against the dev DB after `npm run db:seed`
npm run lint      # type-check
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_SECRET` | encrypts TOTP secrets; long random string, never change after enabling 2FA |
| `STORAGE_DIR` | where uploaded documents live (default `./storage`); never exposed publicly |
| `SEED_ADMIN_PASSWORD` | password given to seeded users |
| `CHROMIUM_PATH` | optional path to Chromium for PDF generation |

Production (docker compose): `DOMAIN`, `DB_PASSWORD`, `APP_SECRET`, `BACKUP_PASSPHRASE`, optional `RCLONE_REMOTE` — see `.env.production.example`.

## Deployment (single VPS)

1. Point the domain's DNS at the VPS; install Docker.
2. `cp .env.production.example .env` and fill in real secrets.
3. `docker compose up -d --build` — starts app, Postgres, Caddy (automatic HTTPS), backup.
4. First run: `docker compose exec app npx tsx prisma/seed.ts` creates the demo users (change their passwords immediately from **المستخدمون** and remove demo data you do not want), or create the first admin by hand.
5. Migrations run automatically on every start (`prisma migrate deploy`).

The Docker files have not been built in the development environment (no Docker daemon there). Do a first
`docker compose build` on the VPS and fix anything it reports.

## Backup / restore

- Daily 02:30: `pg_dump` + documents tarball, AES-256 encrypted with `BACKUP_PASSPHRASE`, stored in the `backups` volume, 14 days kept.
- Off-server copy: put an rclone config in `deploy/backup/rclone/` and set `RCLONE_REMOTE` (e.g. an S3 bucket or another server).
- Restore: `docker compose exec backup restore.sh /backups/ard-YYYYMMDD-HHMMSS.tar.enc`
  (restores the database; the backup container mounts documents read-only, so on a new server extract `documents.tar.gz` from the archive into the `documents` volume).
- **Keep `BACKUP_PASSPHRASE` somewhere safe outside the server; without it backups cannot be opened.**
- The dump → encrypt → decrypt → restore cycle was tested with these scripts against a local PostgreSQL (238 pilgrim rows restored identically). It has not been exercised inside Docker — do a restore drill on the real server once.

## Security notes

- Login is username + password (argon2id). 5 failed attempts lock the username for 15 minutes. Sessions expire after 30 min idle / 12 h absolute.
- TOTP exists in the code but is off by default (decision: no mandatory 2FA).
- Permissions are checked on the server for every page, action and API route (`src/lib/permissions.ts`). Documents are only served via `/api/documents/:id` after a permission check.
- Passport data is sensitive: keep the VPS patched, restrict SSH, and keep backups encrypted.

## Roles

ADMIN (everything), REGISTRATION (pilgrims, documents, bookings, import), HOUSING (seats), ACCOUNTANT (agents), SUPERVISOR (only trips assigned to them, incl. health notes).

## Partner (Nusuk) export template

Planned for Phase 2 — column mapping stored in the database, editable by ADMIN. Not built yet.
