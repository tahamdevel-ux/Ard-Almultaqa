import { test, expect, type Page } from "@playwright/test";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username); await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

test("accountant: pay in dinars at a rate, receipt, refund guard, cancel, move, agent statement", async ({ page }) => {
  await login(page, "acc");
  await expect(page.getByText("الأرصدة المستحقة")).toBeVisible();

  await page.goto("/trips");
  await page.click("a:has-text('A-2612')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  const tripId = page.url().split("/").pop()!;
  await expect(page.getByText("أسعار الرحلة")).toBeVisible();

  // open the account of the last (unpaid) booking
  const links = page.locator("a[href^='/bookings/']");
  const n = await links.count();
  await links.nth(n - 1).click();
  await page.waitForURL(/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();

  // price override so the test is repeatable on a shared dev database
  const priceForm = page.locator("section", { hasText: "نوع الغرفة والسعر" });
  await priceForm.locator("[name=amount]").fill("100000");
  await priceForm.locator("button:has-text('حفظ')").click();
  await expect(priceForm.getByRole("status")).toBeVisible();

  // dinar payment: 140,000 IQD at 1400 => $100
  const payForm = page.locator("section", { hasText: "استلام دفعة" });
  await payForm.locator("[name=amount]").fill("140000");
  await payForm.locator("[name=currency]").selectOption("IQD");
  await payForm.locator("[name=rate]").fill("1400");
  await payForm.locator("button:has-text('تسجيل الدفعة')").click();
  await expect(payForm.getByRole("status")).toContainText("وصل رقم");
  await expect(page.locator("table").getByText("$100", { exact: true }).first()).toBeVisible();

  // dinars without a rate are refused
  await payForm.locator("[name=amount]").fill("5000");
  await payForm.locator("[name=currency]").selectOption("IQD");
  await payForm.locator("[name=rate]").fill("");
  await payForm.locator("button:has-text('تسجيل الدفعة')").click();
  await expect(payForm.getByRole("alert")).toContainText("سعر الصرف");

  // receipt PDF
  const href = await page.locator("a:has-text('وصل PDF')").first().getAttribute("href");
  const r = await page.request.get(href!);
  expect(r.status()).toBe(200);
  expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");

  // refund larger than paid is refused
  const refund = page.locator("section", { hasText: "استرداد مبلغ" });
  await refund.locator("[name=amount]").fill("99999999");
  await refund.locator("[name=currency]").selectOption("USD");
  await refund.locator("[name=reason]").fill("تجربة");
  await refund.locator("button:has-text('تسجيل الاسترداد')").click();
  await expect(refund.getByRole("alert")).toContainText("أكبر من المدفوع");

  // moving a pilgrim between trips is a registration/admin action
  await page.context().clearCookies();
  await login(page, "admin");
  await page.goto(bookingUrl);

  // move to another trip keeps the payment
  await page.locator("section", { hasText: "نقل المعتمر" }).locator("select").selectOption({ index: 0 });
  await page.locator("section", { hasText: "نقل المعتمر" }).locator("button:has-text('نقل')").click();
  await page.waitForURL((u) => /bookings\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== bookingUrl);
  expect(page.url()).not.toBe(bookingUrl);
  await expect(page.locator("table").getByText("$100", { exact: true }).first()).toBeVisible();

  // cancel with refund
  const cancel = page.locator("section", { hasText: "إلغاء الحجز" });
  await cancel.locator("[name=reason]").fill("ظرف صحي");
  await cancel.locator("[name=refundAmount]").fill("40");
  await cancel.locator("[name=currency]").selectOption("USD");
  await cancel.locator("button:has-text('إلغاء الحجز')").click();
  await expect(page.getByText("ملغى (ظرف صحي)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("ملغى (ظرف صحي)")).toBeVisible();
  await expect(page.locator("table").getByText("استرداد")).toBeVisible();

  // agent statement
  await page.goto("/agents");
  await page.locator("a[href^='/agents/']").first().click();
  await page.waitForURL(/agents\/[0-9a-f-]{36}$/);
  const agentId = page.url().split("/").pop()!;
  await expect(page.getByText("إجمالي الأسعار").first()).toBeVisible();
  for (const f of ["pdf", "xlsx"]) {
    const s = await page.request.get(`/api/agents/${agentId}/statement?format=${f}`);
    expect(s.status()).toBe(200);
  }
  expect(tripId).toBeTruthy();
});

test("registration and housing cannot see money", async ({ page }) => {
  await login(page, "reg");
  await expect(page.getByText("الأرصدة المستحقة")).toHaveCount(0);
  await page.goto("/trips");
  await page.click("a:has-text('L-2611')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  await expect(page.getByText("أسعار الرحلة")).toHaveCount(0);
  await expect(page.locator("th", { hasText: "المتبقي" })).toHaveCount(0);
  const anyBooking = "00000000-0000-0000-0000-000000000000";
  await page.goto(`/bookings/${anyBooking}`);
  await expect(page).toHaveURL(/forbidden/);
  const rec = await page.request.get(`/api/payments/${anyBooking}/receipt`);
  expect(rec.status()).toBe(403);
});
