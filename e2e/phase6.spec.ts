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

test("trips list: edit and delete from the list; pilgrims list is grouped by trip", async ({ page }) => {
  await login(page, "admin");
  const name = `رحلة للتعديل ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", name);
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);

  // add one pilgrim so the group shows up in the pilgrims list
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill("A10000137");
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // pilgrims list: a divider with the trip name above the pilgrim
  await page.goto("/pilgrims?q=A10000137");
  await expect(page.locator("tbody tr th", { hasText: name })).toBeVisible();

  // edit from the trips list
  await page.goto("/trips");
  const row = page.locator("tr", { hasText: name });
  await row.getByRole("link", { name: "تعديل" }).click();
  await page.fill("[name=name]", `${name} معدّلة`);
  await page.fill("[name=capacity]", "55");
  await page.click("button:has-text('حفظ التعديلات')");
  await expect(page.getByText("تم الحفظ")).toBeVisible();
  await page.goto("/trips");
  await expect(page.locator("tr", { hasText: `${name} معدّلة` })).toContainText("55");

  // delete (confirm dialog) — allowed even with pilgrims
  page.once("dialog", (d) => d.accept());
  await page.locator("tr", { hasText: `${name} معدّلة` }).getByRole("button", { name: "حذف" }).click();
  await expect(page.locator("tr", { hasText: `${name} معدّلة` })).toHaveCount(0, { timeout: 10000 });
  // the pilgrim is still registered but no longer on that trip
  await page.goto("/pilgrims?q=A10000137");
  await expect(page.locator("tbody tr th", { hasText: name })).toHaveCount(0);
  await expect(page.getByText("A10000137").first()).toBeVisible();
});
