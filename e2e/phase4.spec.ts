import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
const RUN = String(Date.now()).slice(-6);
const BAD = /\bnull\b|undefined|NaN|Invalid Date|1970/;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

async function createTrip(page: Page, name: string, transport: "LAND" | "AIR", fields: { tripNo?: string; departDate?: string; returnDate?: string } = {}) {
  await page.goto("/trips/new");
  await page.fill("[name=name]", name);
  await page.selectOption("[name=transportType]", transport);
  if (fields.tripNo) await page.fill("[name=tripNo]", fields.tripNo);
  if (fields.departDate) await page.fill("[name=departDate]", fields.departDate);
  if (fields.returnDate) await page.fill("[name=returnDate]", fields.returnDate);
  await page.fill("[name=capacity]", "20");
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("trip with no code and no dates: create, list order, pickers, edit + audit, outputs", async ({ page }) => {
  await login(page, "admin");

  // 1) create with only a name (and one air trip the same way)
  const name = `رحلة بلا رقم ${RUN}`;
  const landId = await createTrip(page, name, "LAND");
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.getByText("التواريخ غير محددة")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(BAD);
  const airName = `رحلة جوية بلا رقم ${RUN}`;
  const airId = await createTrip(page, airName, "AIR");

  // a dated trip must still be validated: return before departure is refused with an Arabic message
  await page.goto("/trips/new");
  await page.fill("[name=name]", "x"); await page.fill("[name=departDate]", "15/11/2026"); await page.fill("[name=returnDate]", "14/11/2026");
  await page.click("button:has-text('إنشاء')");
  await expect(page.locator("p.alert-bad")).toContainText("تاريخ العودة لا يمكن أن يسبق");

  // 2) list: newest created first, whatever the dates; no "null" anywhere
  await page.goto("/trips");
  const rows = await page.locator("tbody tr").allInnerTexts();
  expect(rows[0]).toContain(airName); // created last
  expect(rows[1]).toContain(name);
  expect(rows.join("\n")).toContain(name);
  expect(rows.join("\n")).not.toMatch(BAD);

  // 3) booking, bus, seat on the undated land trip
  await page.goto(`/trips/${landId}`);
  await page.fill("[name=number]", "9");
  await page.click("button:has-text('إضافة باص')");
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill("A10000137");
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإضافة" }).click();
  await expect(page.getByRole("dialog").getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("table").getByText("A10000137")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(BAD);
  await page.click("a[href*='/bus/']:has-text('باص 1')");
  // the new booking was seated automatically on the first general bus (bus 1 opens with the trip)
  await expect(page.locator("body")).toContainText("1 / 48");

  // 4) the move-to-another-trip picker renders undated trips without errors
  await page.goto(`/trips/${landId}`);
  await page.locator("a[href^='/bookings/']").first().click();
  await page.waitForURL(/bookings\/[0-9a-f-]{36}$/);
  const options = await page.locator("select[name=tripId] option").allInnerTexts();
  expect(options.join("\n")).toContain(airName);
  expect(options.join("\n")).not.toMatch(BAD);
  expect(await page.locator("body").innerText()).not.toMatch(BAD);

  // 5) fill then clear the three fields from the trip page; both are audited
  await page.goto(`/trips/${landId}`);
  const form = page.locator("section", { hasText: "رقم الرحلة والتواريخ" });
  await form.locator("[name=tripNo]").fill(`E2E-${RUN}`);
  await form.locator("[name=departDate]").fill("20/12/2026");
  await form.locator("button:has-text('حفظ')").click();
  await expect(page.locator("h1")).toContainText(`E2E-${RUN}`);
  await expect(page.locator("body")).toContainText("20/12/2026 ← غير محدد");
  // return date before departure is refused
  await form.locator("[name=returnDate]").fill("19/12/2026");
  await form.locator("button:has-text('حفظ')").click();
  await expect(form.getByRole("alert")).toContainText("تاريخ العودة لا يمكن أن يسبق");
  await form.locator("[name=returnDate]").fill("");
  await form.locator("[name=tripNo]").fill("");
  await form.locator("[name=departDate]").fill("");
  await form.locator("button:has-text('حفظ')").click();
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.getByText("التواريخ غير محددة")).toBeVisible();
  await page.goto(`/audit?q=E2E-${RUN}`);
  const audit = await page.locator("tbody").innerText();
  expect(audit).toContain("رقم الرحلة");
  await page.goto("/audit?q=20");
  expect(await page.locator("tbody").innerText()).toContain("تاريخ الذهاب");

  // 6) outputs for the empty trips download cleanly
  const kinds: [string, string][] = [["manifest", `&bus=${await busId(page, landId)}`]];
  for (const [k, q] of kinds) {
    const r = await page.request.get(`/api/trips/${landId}/outputs/${k}?format=pdf${q}`);
    expect(r.status(), k).toBe(200);
    expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect(r.headers()["content-disposition"]).not.toMatch(BAD);
  }
  for (const [k, q] of [["manifest", `&bus=${await busId(page, landId)}`]]) {
    const r = await page.request.get(`/api/trips/${landId}/outputs/${k}?format=xlsx${q}`);
    expect(r.status(), `${k} xlsx`).toBe(200);
  }
  const fl = await page.request.get(`/api/trips/${airId}/outputs/flight-list?format=pdf`);
  expect(fl.status()).toBe(200);
  for (const lang of ["rooming-ar", "rooming-en"]) {
    const r = await page.request.get(`/api/trips/${landId}/outputs/${lang}?format=pdf&city=MAKKAH`);
    expect(r.status(), lang).toBe(200);
  }
});

async function busId(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}`);
  const href = await page.locator("a[href*='/bus/']").first().getAttribute("href");
  return href!.split("/bus/")[1];
}
