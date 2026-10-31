#!/bin/sh
# Container entrypoint (Railway, DigitalOcean App Platform, docker compose).
set -e
npx prisma migrate deploy                                   # apply pending DB migrations
if [ "$SEED_DEMO" = "1" ]; then npx tsx prisma/seed.ts; fi  # demo data: testing only
npx tsx prisma/bootstrap.ts                                 # secret checks + first admin (only if no users yet)
exec npx next start -p "${PORT:-3000}"
