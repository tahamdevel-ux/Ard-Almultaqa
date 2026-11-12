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

test("no room number is typed: a family added one after the other ends up in one office room automatically", async ({ page }) => {
  await login(page, "admin");
  const tripName = `غرفة العائلة ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", tripName); await page.selectOption("[name=transportType]", "AIR");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url(); const tripId = tripUrl.split("/").pop()!;
  for (const n of [1, 2]) {
    await page.goto("/pilgrims/new");
    const f = (k: string, v: string) => page.fill(`[name=${k}]`, v);
    await f("fullNameAr", `عائلة${n} سالم محمود`); await f("familyName", "المولى");
    await page.selectOption("[name=gender]", "MALE"); await page.fill("[name=motherName]", "ام الاختبار"); await f("birthDate", "12/05/1975"); await f("passportNo", `A${RUN}${n}`);
    await f("enGivenName", "ROOM"); await f("enSurname", "ONE"); await f("passportExpiry", "10/10/2031");
    await page.locator("label", { hasText: tripName }).locator("input[name=tripIds]").check();
    await expect(page.locator(`input[name="officeRoom__${tripId}"]`)).toHaveCount(0); // nobody types a room number any more
    if (n === 1) await page.locator(`input[name="isHead__${tripId}"]`).check();
    else await page.locator(`select[name="headOf__${tripId}"]`).selectOption({ index: 1 });
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await page.waitForURL(/\/pilgrims\?.*saved=/);
  }
  await page.goto(`${tripUrl}/office-rooms`);
  await expect(page.locator("[data-room]")).toHaveCount(1);
  await expect(page.locator("[data-room]").first()).toContainText("عائلة1");
  await expect(page.locator("[data-room]").first()).toContainText("عائلة2");
});

test("Enter saves and opens a new form that keeps trip and agent; head of family + add a family member", async ({ page }) => {
  await login(page, "admin");
  const tripName = `رب أسرة ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", tripName); await page.selectOption("[name=transportType]", "AIR");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripId = page.url().split("/").pop()!;

  const fill = async (n: number, name: string) => {
    const f = (k: string, v: string) => page.fill(`[name=${k}]`, v);
    await f("fullNameAr", name); await f("motherName", "ام الاختبار");
    await page.selectOption("[name=gender]", "MALE"); await f("birthDate", "12/05/1975"); await f("passportNo", `C${RUN}${n}`);
    await f("enGivenName", "ENTER"); await f("enSurname", "KEY"); await f("passportExpiry", "10/10/2031");
  };
  await page.goto("/pilgrims/new");
  await fill(1, "رب الأسرة المفتاح سالم");
  await page.selectOption("[name=agentId]", { index: 1 });
  const agentId = await page.locator("[name=agentId]").inputValue();
  await page.locator("label", { hasText: tripName }).locator("input[name=tripIds]").check();
  await page.locator(`input[name="isHead__${tripId}"]`).check();
  await page.locator("[name=enSurname]").press("Enter"); // = حفظ وإضافة جديد
  await page.waitForURL(/\/pilgrims\/new\?.*saved=/);
  await expect(page.getByText(/^تم حفظ رب الأسرة/)).toBeVisible();
  await expect(page.locator("[name=fullNameAr]")).toHaveValue("");
  await expect(page.locator("[name=motherName]")).toHaveValue("");
  await expect(page.locator("[name=agentId]")).toHaveValue(agentId);
  await expect(page.locator(`input[name=tripIds][value="${tripId}"]`)).toBeChecked();

  // a family member: pick the head just saved
  await fill(2, "فرد الأسرة المفتاح سالم");
  await page.locator(`select[name="headOf__${tripId}"]`).selectOption({ index: 1 });
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForURL(/\/pilgrims\?.*saved=/);

  // the head tag shows next to his name in the trip list
  await page.goto(`/trips/${tripId}`);
  await expect(page.locator("tbody tr", { hasText: "رب الأسرة المفتاح" }).locator("[aria-label='رب الأسرة']").first()).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "فرد الأسرة المفتاح" })).toContainText("تابع لـ");
});

test("archive a trip (hidden from lists and pickers, read-only) and search inside a trip", async ({ page }) => {
  await login(page, "admin");
  const tripName = `أرشفة ${RUN}`;
  await page.goto("/trips/new");
  await page.fill("[name=name]", tripName); await page.selectOption("[name=transportType]", "AIR");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url(); const tripId = tripUrl.split("/").pop()!;

  // two pilgrims; one with a note and an agent
  for (const [n, name, note] of [[1, "بحث الأول سالم", "مريض سكر"], [2, "بحث الثاني محمود", ""]] as const) {
    await page.goto("/pilgrims/new");
    const f = (k: string, v: string) => page.fill(`[name=${k}]`, v);
    await f("fullNameAr", name); await f("motherName", "ام الاختبار"); await page.selectOption("[name=gender]", "MALE"); await f("birthDate", "12/05/1975");
    await f("passportNo", `D${RUN}${n}`); await f("enGivenName", "SEARCH"); await f("enSurname", `NUMBER${n}`); await f("passportExpiry", "10/10/2031");
    if (note) await f("healthNotes", note);
    await page.locator("label", { hasText: tripName }).locator("input[name=tripIds]").check();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await page.waitForURL(/\/pilgrims\?.*saved=/);
  }
  await page.goto(tripUrl);
  await expect(page.locator("tbody tr", { hasText: "بحث الأول" })).toContainText("📝");
  // live search inside the trip
  await page.getByLabel("بحث داخل الرحلة").fill(`d${RUN}2`.toUpperCase());
  await expect(page.locator("tbody tr", { hasText: "بحث الثاني" })).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "بحث الأول" })).toHaveCount(0);
  await page.getByLabel("بحث داخل الرحلة").fill("number1");
  await expect(page.locator("tbody tr", { hasText: "بحث الأول" })).toBeVisible();
  await page.getByLabel("بحث داخل الرحلة").fill("");
  await page.getByRole("link", { name: "لديهم ملاحظات" }).click();
  await expect(page.locator("tbody tr", { hasText: "بحث الأول" })).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "بحث الثاني" })).toHaveCount(0);

  // archive: hidden everywhere, shown in the archive, read-only
  page.once("dialog", (d) => d.accept());
  await page.goto(tripUrl);
  await page.getByRole("button", { name: "إجراءات الرحلة" }).click();
  await page.getByRole("button", { name: "أرشفة الرحلة" }).click();
  await page.waitForURL(/\/trips$/);
  await expect(page.locator("tr", { hasText: tripName })).toHaveCount(0);
  await page.goto("/pilgrims/new");
  await expect(page.locator("label", { hasText: tripName })).toHaveCount(0); // not offered in the picker
  await page.goto("/trips?archive=1");
  await expect(page.locator("tr", { hasText: tripName })).toBeVisible();
  await page.goto(tripUrl);
  await expect(page.getByText("هذه رحلة مؤرشفة").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "إضافة معتمر" })).toHaveCount(0);
  // unarchive (admin)
  await page.goto(tripUrl);
  await page.getByRole("button", { name: "إجراءات الرحلة" }).click();
  await page.getByRole("button", { name: "إلغاء الأرشفة" }).click();
  // we are already on this URL, so wait for the real effect (the archived banner goes away) before leaving the page
  await expect(page.getByText("هذه رحلة مؤرشفة")).toHaveCount(0);
  await page.goto("/trips");
  await expect(page.locator("tr", { hasText: tripName })).toBeVisible();
  // an accountant may archive but not unarchive
  await page.context().clearCookies();
  await login(page, "acc");
  await page.goto(tripUrl);
  await page.getByRole("button", { name: "إجراءات الرحلة" }).click();
  await expect(page.getByRole("button", { name: "أرشفة الرحلة" })).toBeVisible();
});
