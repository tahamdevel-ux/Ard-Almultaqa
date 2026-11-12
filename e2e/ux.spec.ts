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
  await bottom.getByRole("button", { name: "المزيد" }).click();
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
  await expect(page.getByLabel("ليالي المدينة")).toBeVisible();
  await expect(page.getByLabel("فندق المدينة (ثابت)")).toBeVisible();
  await page.getByRole("link", { name: "المطبوعات" }).click();
  await page.waitForURL(/\/prints$/);
  await expect(page.getByRole("navigation", { name: "مسار الصفحة" })).toContainText("المطبوعات");
});
