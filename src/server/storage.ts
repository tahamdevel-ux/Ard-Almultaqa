import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

/** Local-disk adapter. An S3 adapter can implement the same three functions. */
export async function putFile(buf: Buffer, ext: string): Promise<string> {
  const key = `${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(root(), { recursive: true });
  await fs.writeFile(path.join(root(), key), buf);
  return key;
}
export async function getFile(key: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key)) throw new Error("bad key");
  return fs.readFile(path.join(root(), key));
}
export async function deleteFile(key: string): Promise<void> {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key)) return;
  await fs.rm(path.join(root(), key), { force: true });
}
