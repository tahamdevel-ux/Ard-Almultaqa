import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

test("template creates a land trip with buses; housing cannot create trips", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/programs");
  const no = "T" + String(Date.now()).slice(-6);
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("[name=tripNo]").fill(no);
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("[name=departDate]").fill("22/11/2026");
  await page.locator("div.card", { hasText: "قافلة الأحد" }).first().locator("button:has-text('إنشاء')").click();
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  await expect(page.locator("header").first()).toContainText(no);
  await expect(page.locator("a[href*='/bus/']:has-text('باص 2')")).toBeVisible();
  await page.context().clearCookies();
  await login(page, "housing");
  await page.goto("/programs");
  await expect(page).toHaveURL(/forbidden/);
});
