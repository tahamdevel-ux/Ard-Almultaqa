/**
 * Runs on every container start (deploy/start.sh):
 *  1. refuses to start a production instance with missing/weak secrets;
 *  2. creates the FIRST admin from ADMIN_USERNAME / ADMIN_PASSWORD, only while the users table is empty
 *     (never touches existing users, so it is safe to leave the variables set).
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const fail = (msg: string): never => { console.error(`\n[startup] ${msg}\n`); process.exit(1); };

if (process.env.NODE_ENV === "production") {
  const secret = process.env.APP_SECRET ?? "";
  if (secret.length < 32 || /change[-_ ]?me/i.test(secret)) fail("APP_SECRET must be set to a random string of at least 32 characters.");
  if (process.env.SEED_DEMO === "1") console.warn("[startup] SEED_DEMO=1: demo data and demo users are being created. Remove it for real use.");
}

const db = new PrismaClient();
(async () => {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!username || !password) { console.log("[startup] no ADMIN_USERNAME/ADMIN_PASSWORD set; skipping first-admin creation"); return; }
  if (await db.user.count() > 0) { console.log("[startup] users already exist; first-admin creation skipped"); return; }
  if (password.length < 10) fail("ADMIN_PASSWORD must be at least 10 characters.");
  await db.user.create({ data: { username, name: process.env.ADMIN_NAME?.trim() || "مدير النظام", role: "ADMIN", passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } });
  console.log(`[startup] first admin '${username}' created. Remove ADMIN_PASSWORD from the environment now.`);
})().catch((e) => fail(String(e))).finally(() => db.$disconnect());
