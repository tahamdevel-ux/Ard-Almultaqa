import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
const RUN = String(Date.now()).slice(-7);

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

async function fillPilgrim(page: Page, passportNo: string) {
  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("firstName", "عبدالله"); await f("fatherName", "سالم"); await f("grandfatherName", "محمود"); await f("familyName", "المولى");
  await page.selectOption("[name=gender]", "MALE");
  await f("birthDate", "12/05/1975"); await f("phone", "07701234567");
  await f("passportNo", passportNo); await f("enGivenName", "ABDULLAH"); await f("enFatherName", "SALIM"); await f("enGrandfatherName", "MAHMOOD"); await f("enSurname", "ALMULA");
  await f("passportExpiry", "10/10/2031");
  await page.click("button:has-text('حفظ')");
}

test("full flow: create pilgrim, upload docs, attach to land trip, seat, manifest PDF, audit", async ({ page }) => {
  await login(page, "admin");
  const passport = `E2E${RUN}`;
  await fillPilgrim(page, passport);
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1")).toContainText("عبدالله سالم محمود المولى");

  // phone-style photo upload
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#ccc" } }).png().toBuffer();
  const photoBox = page.locator("div.rounded.border", { hasText: "صورة الجواز" }).first();
  await photoBox.locator("input[type=file]").setInputFiles({ name: "passport.png", mimeType: "image/png", buffer: png });
  await photoBox.locator("button:has-text('رفع')").click();
  await expect(photoBox.locator("img")).toBeVisible();

  // attach to trip
  await page.goto("/trips");
  await page.click("text=L-2611");
  await page.fill("[name=passportNo]", passport);
  await page.click("button:has-text('إضافة'):not(:has-text('باص'))");
  await expect(page.locator("table").getByText(passport)).toBeVisible();

  // seat
  await page.click("a[href*='/bus/']:has-text('باص 1')");
  const free = page.locator("form select[name=bookingId]").first();
  await free.selectOption({ label: "عبدالله سالم محمود المولى" });
  await free.locator("xpath=..").locator("button").click();
  await expect(page.getByText("عبدالله سالم محمود المولى").first()).toBeVisible();

  // manifest PDF
  const tripUrl = page.url().split("/bus/")[0];
  const tripId = tripUrl.split("/").pop();
  const busLink = await page.request.get(`/api/trips/${tripId}/outputs/manifest?bus=${page.url().split("/bus/")[1]}&format=pdf`);
  expect(busLink.status()).toBe(200);
  expect(busLink.headers()["content-type"]).toBe("application/pdf");
  expect((await busLink.body()).subarray(0, 4).toString()).toBe("%PDF");
  const x = await page.request.get(`/api/trips/${tripId}/outputs/manifest?bus=${page.url().split("/bus/")[1]}&format=xlsx`);
  expect(x.status()).toBe(200);

  // edit name -> audit
  await page.goto(`/pilgrims?q=${passport}`);
  await page.click(`text=عبدالله سالم محمود المولى`);
  await page.fill("[name=firstName]", "عبدالرحمن");
  await page.click("button:has-text('حفظ')");
  await expect(page.getByText("تم الحفظ")).toBeVisible();
  await page.goto(`/audit?q=عبدالرحمن`);
  await expect(page.getByText("الاسم الأول").first()).toBeVisible();
  await expect(page.getByText("عبدالله").first()).toBeVisible();
});

test("duplicate passport is blocked with Arabic message", async ({ page }) => {
  await login(page, "reg");
  const passport = `DUP${RUN}`;
  await fillPilgrim(page, passport);
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}$/);
  await fillPilgrim(page, passport);
  await expect(page.getByText("رقم الجواز مسجّل مسبقاً لمعتمر آخر").first()).toBeVisible();
});

test("role permissions enforced on pages and routes", async ({ page, request }) => {
  const anon = await request.get("/api/documents/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect(anon.status()).toBe(401);
  await login(page, "acc");
  await page.goto("/users");
  await expect(page).toHaveURL(/forbidden/);
  await page.goto("/audit");
  await expect(page).toHaveURL(/forbidden/);
  await page.goto("/pilgrims/new");
  await expect(page).toHaveURL(/forbidden/);
  const r = await page.request.get("/api/documents/00000000-0000-0000-0000-000000000000");
  expect(r.status()).toBe(403);
});
