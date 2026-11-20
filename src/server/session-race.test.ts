import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { db } from "./db";
import { getUserByToken } from "./auth";

afterAll(async () => { await db.session.deleteMany(); await db.user.deleteMany({ where: { username: "race_user" } }); });

describe("expired session", () => {
  it("parallel requests that all find it expired return «not logged in» instead of failing", async () => {
    const u = await db.user.create({ data: { username: "race_user", name: "r", passwordHash: "x", role: "ADMIN" } });
    const token = "race-token";
    await db.session.create({ data: { userId: u.id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(Date.now() - 3 * 3600_000) } as never });
    const r = await Promise.all([getUserByToken(token), getUserByToken(token), getUserByToken(token), getUserByToken(token)]);
    expect(r).toEqual([null, null, null, null]);
  });
});
