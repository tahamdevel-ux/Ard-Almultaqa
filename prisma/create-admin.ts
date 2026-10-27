import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

// Usage: npx tsx prisma/create-admin.ts <username> <password> ["Full name"]
const [username, password, name] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: create-admin.ts <username> <password (8+ chars)> ["Full name"]');
  process.exit(1);
}
const db = new PrismaClient();
(async () => {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await db.user.upsert({
    where: { username },
    create: { username, name: name || username, passwordHash, role: "ADMIN" },
    update: { passwordHash, role: "ADMIN", active: true },
  });
  console.log(`admin user '${username}' is ready`);
})().finally(() => db.$disconnect());
