import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

/**
 * The migrations, applied from scratch, must produce exactly the schema the code expects (prisma/schema.prisma).
 * A mismatch is what caused «column Agent.commissionType does not exist» on the live site when a branch without a
 * dropped-column migration was deployed over a database that already had it.
 */
describe("schema drift", () => {
  it("database built from the migrations equals schema.prisma", () => {
    let out = "";
    try {
      out = execFileSync("npx", ["prisma", "migrate", "diff", "--from-url", process.env.DATABASE_URL!, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { out = String((e as { stdout?: string }).stdout ?? e); expect(out, "migrations and schema.prisma differ").toBe(""); }
    expect(out).toContain("No difference");
  }, 60_000);
});
