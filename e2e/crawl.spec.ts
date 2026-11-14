import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { ROLES, PW, seedHostile, routes, apiRoutes } from "./hostileData";

/**
 * Opens EVERY page and output of the program, as every role, against deliberately messy data (e2e/hostileData.ts).
 * Fails on: a server error page, an HTTP 5xx, an unhandled browser error, a console error from the app.
 * Run on its own with:  npx playwright test e2e/crawl.spec.ts
 */
const db = new PrismaClient();
let S: Awaited<ReturnType<typeof seedHostile>>;
test.beforeEach(async () => {
  // the crawl owns its rows: start from an empty business-data set (users are kept)
  await db.$executeRawUnsafe(`TRUNCATE "Payment","SeatAssignment","OfficeRoomMember","OfficeRoom","BookingGroupMember","RoomAssignment","Booking","FamilyGroup","Pilgrim","TripHotelPrice","TripHotel","TripAgentCommission","TripPrice","Flight","GroundCar","Bus","Room","Trip","Hotel","Agent","AuditLog" RESTART IDENTITY CASCADE`);
  S = await seedHostile(db);
});
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, role: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#username", role === "ADMIN" ? "admin" : `crawl_${role.toLowerCase()}`); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL(/\/(dashboard|pilgrims|trips|forbidden)/);
}

const IGNORE_CONSOLE = [/favicon/i, /Download the React DevTools/i, /Failed to load resource.*(40[134])/i];

for (const role of ROLES) {
  test(`pages: every screen opens without an error as ${role}`, async ({ page }) => {
    test.setTimeout(600_000);
    await login(page, role);
    const problems: string[] = [];
    let current = "";
    page.on("pageerror", (e) => problems.push(`[${current}] browser error: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !IGNORE_CONSOLE.some((r) => r.test(m.text()))) problems.push(`[${current}] console: ${m.text().slice(0, 200)}`); });
    for (const url of routes(S)) {
      current = url;
      const res = await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => { problems.push(`[${url}] navigation failed: ${e.message.slice(0, 100)}`); return null; });
      if (!res) continue;
      if (res.status() >= 500) problems.push(`[${url}] HTTP ${res.status()}`);
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Application error|server-side exception|Internal Server Error|This page could not be found/.test(body) && !/does-not-exist|nope|not-an-id/.test(url)) problems.push(`[${url}] error page: ${body.slice(0, 120).replace(/\s+/g, " ")}`);
      if (/undefined|\[object Object\]|NaN|Invalid Date/.test(body)) problems.push(`[${url}] shows a raw value: ${(body.match(/.{0,30}(undefined|\[object Object\]|NaN|Invalid Date).{0,30}/) ?? [""])[0].replace(/\s+/g, " ")}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test(`outputs: files and JSON answer without a 5xx as ${role}`, async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, role);
    const bad: string[] = [];
    for (const url of apiRoutes(S)) {
      const r = await page.request.get(url, { timeout: 60_000 }).catch((e) => ({ status: () => -1, text: async () => e.message }) as never);
      if (r.status() >= 500 || r.status() === -1) bad.push(`${url} → ${r.status()} ${(await r.text()).slice(0, 120)}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
}
