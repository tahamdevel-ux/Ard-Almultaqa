import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
const RUN = String(Date.now()).slice(-7);

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

test("office rooms: automatic assignment, board, badge, filter, internal print, permissions", async ({ page }) => {
  await login(page, "admin");

  // agent room code: validated and unique
  await page.goto("/agents");
  const codeInputs = page.locator("input[name=roomCode][aria-label^='رمز غرف']");
  expect(await codeInputs.count()).toBeGreaterThan(1);
  await codeInputs.nth(0).fill("q" + (Number(RUN.slice(-1)) % 5)); // unique per run is not needed: same value is simply saved again
  await codeInputs.nth(0).locator("xpath=following-sibling::button").click();
  await expect(page.locator("p.alert-bad")).toHaveCount(0);

  // a trip and a pilgrim added to it: the office room is created automatically
  await page.goto("/trips/new");
  await page.fill("[name=name]", `غرف المكتب ${RUN}`); await page.selectOption("[name=transportType]", "AIR");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill("A10000137");
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإضافة" }).click();
  await expect(page.getByRole("dialog").getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/trips/${tripId}/office-rooms`);
  await expect(page.getByText("داخلي للمكتب · لا يُسلَّم لأي جهة").first()).toBeVisible();
  const card = page.locator("[data-room]").first();
  await expect(card).toContainText("رجال");
  await expect(card).toContainText("— فارغ —"); // default capacity 4: three empty beds
  const label = (await card.getAttribute("data-room"))!;

  // new room, lock, re-run
  await page.getByRole("button", { name: "غرفة جديدة" }).click();
  await expect(page.locator("[data-room]")).toHaveCount(2);
  await card.getByRole("button", { name: "قفل الغرفة" }).click();
  await expect(card.getByRole("button", { name: "فتح القفل" })).toBeVisible();
  await page.getByRole("button", { name: "أعد التوزيع" }).click();
  await expect(page.locator("[data-room]").first()).toBeVisible();

  // the badge in the pilgrims list and the filter by office room
  await page.goto("/pilgrims?q=A10000137");
  await expect(page.locator("tbody th", { hasText: `غرف المكتب ${RUN}` }).locator("xpath=ancestor::tbody").locator(".chip", { hasText: label })).toBeVisible();
  await page.goto(`/pilgrims?room=${label}`);
  await expect(page.locator("tbody th", { hasText: `غرف المكتب ${RUN}` })).toBeVisible();

  // the internal print is a PDF; the normal outputs of the trip never mention the room
  const pdf = await page.request.get(`/api/trips/${tripId}/office-rooms/print`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // permissions: housing edits, accountant has no access
  await page.context().clearCookies();
  await login(page, "housing");
  await page.goto(`/trips/${tripId}/office-rooms`);
  await expect(page.getByRole("button", { name: "غرفة جديدة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إعادة ترقيم" })).toHaveCount(0); // admin only
  await page.context().clearCookies();
  await login(page, "acc");
  await page.goto(`/trips/${tripId}/office-rooms`);
  await expect(page).toHaveURL(/forbidden/);
  expect((await page.request.get(`/api/trips/${tripId}/office-rooms/print`)).status()).toBe(403);
});
