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
  await expect(page.getByText("فنادق مكة والأسعار")).toBeVisible();

  // open the account of the last (unpaid) booking
  await page.waitForLoadState("networkidle"); // the trip page is heavy: let it hydrate before clicking
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
  page.once("dialog", (d) => d.accept());
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
  page.once("dialog", (d) => d.accept());
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

test("every role sees the accounts; only admin and accountant can refund", async ({ page }) => {
  for (const user of ["reg", "housing", "sup"]) {
    await login(page, user);
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: "الحسابات" })).toBeVisible();
    await expect(page.getByText("المطلوب").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "تسجيل دفعة" })).toBeVisible();
    await page.context().clearCookies();
  }
  await login(page, "reg");
  await page.goto("/trips");
  await page.click("a:has-text('L-2611')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  await expect(page.getByText("فنادق مكة والأسعار")).toBeVisible();      // prices are visible to everyone
  await expect(page.getByRole("button", { name: "حفظ الأسعار" })).toHaveCount(0); // but only admin/accountant edit them
  // a payment can be recorded by anyone, a refund form is for admin/accountant only
  await page.waitForLoadState("networkidle"); // the trip page is heavy: let it hydrate before clicking
  await page.locator("a[href^='/bookings/']").first().click();
  await page.waitForURL(/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "استلام دفعة" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "استرداد مبلغ" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "إلغاء الحجز" })).toHaveCount(0);
  await page.context().clearCookies();
  await login(page, "acc");
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: "تسجيل دفعة" })).toBeVisible();
});

test("accounts: summary cards, four tabs, drill-down, payment with source", async ({ page }) => {
  await login(page, "admin");
  // a priced booking on the seeded land trip
  await page.goto("/trips");
  await page.click("a:has-text('L-2611')");
  await page.waitForURL(/trips\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle"); // the trip page is heavy: let it hydrate before clicking
  await page.locator("a[href^='/bookings/']").first().click();
  await page.waitForURL(/bookings\/[0-9a-f-]{36}$/);
  const bookingId = page.url().split("/").pop()!;
  await page.fill("[name=amount]", "100000"); // plenty, so repeated runs on the demo data keep working
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByText("تم").first()).toBeVisible();

  await page.goto("/accounts");
  for (const l of ["المطلوب", "المستلم", "الباقي", "عمولات الوكلاء"]) await expect(page.getByText(l, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "الأقسام" }).getByRole("link", { name: "الرحلات", exact: true })).toBeVisible();
  // drill down: trip row -> that trip's pilgrims
  await page.locator("td a", { hasText: "L-2611" }).first().click();
  await expect(page).toHaveURL(/tab=pilgrims&.*trip=|trip=.*tab=pilgrims/);
  await expect(page.getByRole("link", { name: "عليهم باقي فقط" })).toBeVisible();
  await page.getByRole("navigation", { name: "الأقسام" }).getByRole("link", { name: "الوكلاء", exact: true }).click();
  await expect(page.locator("th", { hasText: "مستلم عن طريقه" })).toBeVisible();

  // record a payment through an agent from the accounts page
  await page.goto(`/accounts/pay?booking=${bookingId}`);
  await page.fill("[name=amount]", "250");
  await page.selectOption("[name=source]", "AGENT");
  await expect(page.locator("#pay-agent")).toBeVisible(); // the agent is required for this source
  await page.selectOption("[name=sourceAgentId]", { index: 1 });
  await page.getByRole("button", { name: "تسجيل الدفعة" }).click();
  await expect(page.getByText(/تم تسجيل الدفعة — وصل رقم/)).toBeVisible();
  await page.goto("/accounts?tab=payments");
  await expect(page.locator("tbody tr").first()).toContainText("عن طريق الوكيل");
  await expect(page.locator("tbody tr").first()).toContainText("$250");
});
