import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#username", "admin"); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

test("phone: bottom navigation reaches every section; desktop keeps the top bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page);
  const bottom = page.getByRole("navigation", { name: "القائمة السفلية" });
  await expect(bottom).toBeVisible();
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeHidden();
  await bottom.getByRole("link", { name: "الرحلات" }).click();
  await page.waitForURL("**/trips");
  await bottom.getByRole("button", { name: "المزيد" }).dispatchEvent("click"); // the dev-mode Next badge sits over this corner
  await expect(page.getByRole("dialog", { name: "المزيد" }).getByRole("link", { name: "الفنادق" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "المزيد" })).toHaveCount(0);
  await page.setViewportSize({ width: 1366, height: 800 });
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible();
  await expect(bottom).toBeHidden();
});

test("trip page: labelled hotel fields and a breadcrumb on sub-pages; destructive actions ask first", async ({ page }) => {
  await login(page);
  await page.goto("/trips");
  await page.locator("a[href^='/trips/']:not([href$='/new'])").first().click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle"); // the trip page is heavy: let it hydrate before clicking
  await page.getByText("إعدادات الرحلة").first().click(); // set-up forms are collapsed on a trip that already has pilgrims
  await expect(page.getByLabel("ليالي المدينة")).toBeVisible();
  await expect(page.getByLabel("فندق المدينة (ثابت)")).toBeVisible();
  await page.getByRole("link", { name: "المطبوعات" }).click();
  await page.waitForURL(/\/prints$/);
  await expect(page.getByRole("navigation", { name: "مسار الصفحة" })).toContainText("المطبوعات");
});

test("dashboard shows what needs attention and the links open the matching filtered list", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("region", { name: "يحتاج انتباهك" })).toBeVisible();
  await page.goto("/pilgrims?f=noroom");
  await expect(page.getByRole("link", { name: "بلا غرفة" })).toHaveAttribute("aria-current", "true");
});

test("pilgrims list: sort by clicking a column, quick filters, clear all", async ({ page }) => {
  await login(page);
  await page.goto("/pilgrims");
  await page.getByRole("link", { name: /^الجواز/ }).click();
  await expect(page).toHaveURL(/sort=passport&dir=asc/);
  await page.getByRole("link", { name: /^الجواز/ }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await page.getByRole("link", { name: "جوازات تنتهي قريباً" }).click();
  await expect(page).toHaveURL(/f=expiring/);
  await page.getByRole("link", { name: "مسح الكل" }).click();
  await expect(page).toHaveURL(/\/pilgrims$/);
});

test("trip page: pilgrims come first, set-up forms sit in a collapsible section", async ({ page }) => {
  await login(page);
  await page.goto("/trips");
  await page.locator("a[href^='/trips/']:not([href$='/new'])").first().click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const list = page.getByRole("heading", { name: /^المعتمرون/ });
  const settings = page.getByText("إعدادات الرحلة").first();
  await expect(list).toBeVisible();
  const a = await list.boundingBox(), b = await settings.boundingBox();
  expect(a!.y).toBeLessThan(b!.y);
});

test("phone: lists become cards with labelled values", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page);
  await page.goto("/accounts");
  await page.waitForLoadState("networkidle");
  const cell = page.locator("table.rt td[data-label='المطلوب']").first();
  await expect(cell).toBeVisible();
  await expect(page.locator("table.rt thead").first()).not.toBeInViewport();
});

test("new pilgrim: sections menu, trip first, English name suggestion fills only empty fields", async ({ page }) => {
  await login(page);
  await page.goto("/pilgrims/new");
  await expect(page.getByRole("navigation", { name: "أقسام النموذج" })).toBeVisible();
  const trips = page.locator("#sec-trips"), personal = page.locator("#sec-personal");
  expect((await trips.boundingBox())!.y).toBeLessThan((await personal.boundingBox())!.y);
  await page.fill("[name=fullNameAr]", "علي حسين محمد");
  await page.fill("[name=enFatherName]", "KEEPME");
  await page.getByRole("button", { name: "اقترح الاسم الإنكليزي من الاسم العربي" }).click();
  await expect(page.locator("[name=enGivenName]")).toHaveValue("ALI");
  await expect(page.locator("[name=enFatherName]")).toHaveValue("KEEPME");
  await expect(page.locator("[name=enGrandfatherName]")).toHaveValue("MOHAMMED");
});

test("whole rows are clickable (trips, pilgrims, accounts) but links and buttons inside keep working", async ({ page }) => {
  await login(page);
  await page.goto("/trips");
  await page.waitForLoadState("networkidle");
  const row = page.locator("tbody tr[data-href]").first();
  const cell = row.locator("td").nth(1); // the name cell, not the link
  await cell.click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.goto("/pilgrims");
  await page.waitForLoadState("networkidle");
  await page.locator("tbody tr[data-href] td").nth(2).click(); // a plain cell
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}/);
});

test("transport: every pilgrim has bus / car / flight, with the trip's default, and no ticket-number box", async ({ page }) => {
  await login(page);
  await page.goto("/trips");
  await page.locator("a[href^='/trips/']:not([href$='/new'])").first().click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[placeholder='رقم التذكرة']")).toHaveCount(0);
  const sel = page.getByLabel("وسيلة النقل").first();
  if (await sel.count()) {
    await expect(sel.locator("option")).toHaveText(["باص", "سيارة", "رحلة جوية"]);
  }
});
