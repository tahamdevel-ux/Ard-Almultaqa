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
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإضافة" }).click();
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

async function newPilgrim(page: Page, passport: string, fullName: string, tripName: string) {
  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("fullNameAr", fullName); await f("familyName", "الاختبار");
  await page.selectOption("[name=gender]", "MALE"); await page.fill("[name=motherName]", "ام الاختبار");
  await f("birthDate", "12/05/1975"); await f("passportNo", passport);
  await f("enGivenName", "TEST"); await f("enSurname", "FAMILY"); await f("passportExpiry", "10/10/2031");
  await page.locator("label", { hasText: tripName }).locator("input[name=tripIds]").check();
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForURL(/\/pilgrims\?.*saved=/);
}

test("accommodation with hotel and room, family head and family account", async ({ page }) => {
  await login(page, "admin");
  const tripName = `عائلة ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", tripName); await page.selectOption("[name=transportType]", "AIR");
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  await page.locator("select[name=newHotel]").selectOption({ index: 1 });
  await page.locator("input[name=new_QUAD]").fill("1000");
  await page.locator("input[name=new_DOUBLE]").fill("1100");
  await page.click("button:has-text('حفظ الأسعار')");
  await expect(page.getByText("تم الحفظ")).toBeVisible();

  // accommodation chosen while adding an existing pilgrim (seeded A10000137)
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill("A10000137");
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  const dlg = page.getByRole("dialog");
  const mk = dlg.locator("select[name=makkahHotelId]");
  await mk.selectOption({ index: 1 });
  await dlg.locator("select[name=roomType]").selectOption("QUAD");
  await dlg.getByRole("button", { name: "تأكيد الإضافة" }).click();
  await expect(dlg.getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("tbody tr", { hasText: "A10000137" })).toContainText("فندق مكة");

  // a family of two with a head
  await newPilgrim(page, `A${RUN}1`, "رب الأسرة سالم محمود", tripName);
  await newPilgrim(page, `A${RUN}2`, "فرد الأسرة سالم محمود", tripName);
  await page.goto(tripUrl);
  const rowHead = page.locator("tbody tr", { hasText: `A${RUN}1` }), rowMember = page.locator("tbody tr", { hasText: `A${RUN}2` });
  for (const row of [rowHead, rowMember]) { // room type on both so each has the trip's price
    await row.locator("details summary").click();
    await row.locator("select[name=roomType]").selectOption("QUAD");
    await row.getByRole("button", { name: "حفظ التسكين" }).click();
    await expect(row.getByText("تم", { exact: true })).toBeVisible();
  }
  await page.reload();
  await rowHead.locator("input[name=bookingIds]").check();
  await rowMember.locator("input[name=bookingIds]").check();
  await rowHead.locator("input[name=headBookingId]").check();
  await page.selectOption("select[name=kind]", "FAMILY");
  await page.click("button:has-text('اجعل المحددين مجموعة واحدة')");
  await expect(page.locator(".chip", { hasText: "رب الأسرة" }).first()).toBeVisible();
  await page.getByRole("link", { name: "حساب الأسرة" }).click();
  await expect(page.getByText("$2,000").first()).toBeVisible();
  await page.fill("[name=amount]", "1500");
  await page.click("button:has-text('تسجيل دفعة الأسرة')");
  await expect(page.getByText(/^تم/)).toBeVisible();
  await expect(page.getByText("$500").first()).toBeVisible(); // family remaining
});

test("new pilgrim page: hotel, room type and room number per selected trip", async ({ page }) => {
  await login(page, "admin");
  const tripName = `تسكين عند الإضافة ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", tripName); await page.selectOption("[name=transportType]", "AIR");
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  const tripId = tripUrl.split("/").pop()!;

  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("fullNameAr", "تسكين سالم محمود"); await f("familyName", "الاختبار");
  await page.selectOption("[name=gender]", "MALE"); await page.fill("[name=motherName]", "ام الاختبار");
  await f("birthDate", "12/05/1975"); await f("passportNo", `A${RUN}3`);
  await f("enGivenName", "TEST"); await f("enSurname", "ROOM"); await f("passportExpiry", "10/10/2031");
  await page.locator("label", { hasText: tripName }).locator("input[name=tripIds]").check();
  await page.locator(`select[name="makkahHotelId__${tripId}"]`).selectOption({ index: 1 });
  await page.locator(`select[name="roomType__${tripId}"]`).selectOption("DOUBLE");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  await page.goto(tripUrl);
  await expect(page.locator("tbody tr", { hasText: `A${RUN}3` })).toContainText("ثنائية");
});
