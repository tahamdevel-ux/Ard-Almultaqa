import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "./db";

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
const KEY_RE = /^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;

/** "db" keeps files in PostgreSQL (hosted previews with no persistent disk); "disk" is the default for a VPS. */
const useDb = () => (process.env.STORAGE_DRIVER ?? (process.env.VERCEL ? "db" : "disk")) === "db";

export async function putFile(buf: Buffer, ext: string): Promise<string> {
  const key = `${crypto.randomUUID()}.${ext}`;
  if (useDb()) {
    await db.storedFile.create({ data: { key, data: new Uint8Array(buf) } });
    return key;
  }
  await fs.mkdir(root(), { recursive: true });
  await fs.writeFile(path.join(root(), key), buf);
  return key;
}
export async function getFile(key: string): Promise<Buffer> {
  if (!KEY_RE.test(key)) throw new Error("bad key");
  if (useDb()) {
    const f = await db.storedFile.findUnique({ where: { key } });
    if (!f) throw new Error("not found");
    return Buffer.from(f.data);
  }
  return fs.readFile(path.join(root(), key));
}
export async function deleteFile(key: string): Promise<void> {
  if (!KEY_RE.test(key)) return;
  if (useDb()) { await db.storedFile.deleteMany({ where: { key } }); return; }
  await fs.rm(path.join(root(), key), { force: true });
}
