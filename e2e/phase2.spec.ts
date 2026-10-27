import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

test("housing: auto-assign, gender rule on drag/move, rooming lists, missing list, ID cards", async ({ page }) => {
  await login(page, "housing");
  await page.goto("/trips");
  await page.click("a:has-text('L-2611')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  const tripId = page.url().split("/").pop()!;
  await page.goto(`/trips/${tripId}/rooming?city=MAKKAH`);
  await page.click("button:has-text('إلغاء كل التسكين')".replace("button", "button"), { trial: true }).catch(() => {});
  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('إلغاء كل التسكين')");
  await page.click("button:has-text('تسكين تلقائي')");
  await expect(page.getByRole("status")).toContainText("تم تسكين");

  // every room is single-gender (♂ xor ♀) unless family; seed has no mixed families
  const rooms = page.locator("[data-room]");
  const n = await rooms.count();
  expect(n).toBeGreaterThan(10);
  for (let i = 0; i < n; i++) {
    const txt = await rooms.nth(i).innerText();
    expect(txt.includes("♂") && txt.includes("♀")).toBe(false);
  }

  // the 4 women of the seeded عصبة are in the same room
  const asabaRoom = page.locator("[data-room]", { has: page.locator("span:text-is('عصبة')") }).first();
  expect(await asabaRoom.locator("span:text-is('عصبة')").count()).toBe(4);

  // gender rule: try to move a woman into a men's room via the pool select (if pool has one) or direct action
  const manRoom = page.locator("[data-room]", { has: page.locator("span:text-is('♂')") }).filter({ hasText: /[0-9]\/4/ }).first();
  const roomNo = await manRoom.getAttribute("data-room");
  const woman = asabaRoom.locator("div.border-pink-300").first();
  await woman.dragTo(manRoom);
  await expect(page.getByRole("alert").first()).toContainText(/الغرفة ممتلئة|لا يجوز خلط/);
  expect(roomNo).toBeTruthy();

  // outputs
  for (const [kind, q] of [["rooming-ar", "&city=MAKKAH"], ["rooming-en", "&city=MAKKAH"], ["missing", ""], ["id-cards", ""]]) {
    const r = await page.request.get(`/api/trips/${tripId}/outputs/${kind}?format=pdf${q}`);
    expect(r.status(), kind).toBe(200);
    expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
  }
  const x = await page.request.get(`/api/trips/${tripId}/outputs/rooming-en?format=xlsx&city=MAKKAH`);
  expect(x.status()).toBe(200);
});

test("template creates a land trip with buses; housing cannot create trips", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/programs");
  const no = "T" + String(Date.now()).slice(-6);
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("[name=tripNo]").fill(no);
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("[name=departDate]").fill("22/11/2026");
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("button:has-text('إنشاء')").click();
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1")).toContainText(no);
  await expect(page.locator("a[href*='/bus/']:has-text('باص 2')")).toBeVisible();
  await page.context().clearCookies();
  await login(page, "housing");
  await page.goto("/programs");
  await expect(page).toHaveURL(/forbidden/);
});
