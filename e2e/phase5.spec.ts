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

test("buses: bus 1 opens with the trip, auto-fill, named bus, move, delete refusal", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/trips/new");
  await page.fill("[name=name]", `قافلة باصات ${RUN}`);
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  await expect(page.locator("a[href*='/bus/']").filter({ hasText: "باص 1" }).first()).toBeVisible();

  // named bus (manual): never auto-filled
  await page.fill("[name=name]", "باص خالد");
  await page.click("button:has-text('إضافة باص')");
  await expect(page.getByText("باص 2 — باص خالد").first()).toBeVisible();

  // add a pilgrim: seated on bus 1, not on the named bus
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill("A10000137");
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // bus 1 cannot be deleted while someone sits on it
  await page.reload();
  await page.getByRole("button", { name: "حذف الباص" }).first().click();
  await expect(page.getByText("انقل المعتمرين أولاً")).toBeVisible();

  // move him to the named bus
  await page.locator("a[href*='/bus/']").filter({ hasText: "باص 1" }).first().click();
  await page.locator("summary:has-text('نقل معتمرين بين الباصات')").click();
  await page.locator("input[name=bookingIds]").first().check();
  await page.selectOption("[name=targetBusId]", { label: /باص 2/ as never }).catch(async () => {
    const v = await page.locator("[name=targetBusId] option").nth(1).getAttribute("value");
    await page.selectOption("[name=targetBusId]", v!);
  });
  await page.click("button:has-text('نقل المحددين')");
  await expect(page.getByText("تم النقل")).toBeVisible();

  // now bus 1 is empty and can be deleted
  await page.goto(tripUrl);
  await page.getByRole("button", { name: "حذف الباص" }).first().click();
  await expect(page.locator("a[href*='/bus/']").filter({ hasText: "باص 1" })).toHaveCount(0, { timeout: 10000 });
});
