import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { db } from "./db";
import { can, type Permission, type Role } from "@/lib/permissions";

export const SESSION_COOKIE = "ard_session";
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });

function secretKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.APP_SECRET ?? "dev-secret").digest();
}
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

export async function login(username: string, password: string, otp?: string): Promise<LoginResult> {
  const since = new Date(Date.now() - LOCK_WINDOW_MS);
  const fails = await db.loginAttempt.count({ where: { username, ok: false, at: { gt: since } } });
  if (fails >= MAX_FAILS) return { ok: false, error: "تم إيقاف الدخول مؤقتاً بسبب محاولات فاشلة كثيرة. حاول بعد ١٥ دقيقة" };
  const user = await db.user.findUnique({ where: { username } });
  let good = false;
  if (user && user.active && (await argon2.verify(user.passwordHash, password))) {
    good = true;
    if (user.totpEnabled && user.totpSecret) {
      good = !!otp && authenticator.check(otp, decryptSecret(user.totpSecret));
      if (!good && !otp) return { ok: false, error: "أدخل رمز التحقق" };
    }
  }
  await db.loginAttempt.create({ data: { username, ok: good } });
  if (!good || !user) return { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  const token = crypto.randomBytes(32).toString("hex");
  await db.session.create({ data: { tokenHash: hash(token), userId: user.id } });
  return { ok: true, token };
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await db.session.deleteMany({ where: { tokenHash: hash(t) } });
  jar.delete(SESSION_COOKIE);
}

export async function getUserByToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!s || !s.user.active) return null;
  const now = Date.now();
  if (now - s.lastSeenAt.getTime() > IDLE_MS || now - s.createdAt.getTime() > ABSOLUTE_MS) {
    await db.session.delete({ where: { id: s.id } });
    return null;
  }
  if (now - s.lastSeenAt.getTime() > 60_000) await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  return { id: s.user.id, username: s.user.username, name: s.user.name, role: s.user.role };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return getUserByToken(jar.get(SESSION_COOKIE)?.value);
}

/** Pages: redirect to login or to the forbidden page. */
export async function requirePage(perm: Permission): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!can(u.role, perm)) redirect("/forbidden");
  return u;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, msg: string) { super(msg); }
}

/** Server actions / route handlers: throws AuthError. */
export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AuthError(401, "يجب تسجيل الدخول");
  if (!can(u.role, perm)) throw new AuthError(403, "ليست لديك صلاحية لهذا الإجراء");
  return u;
}
