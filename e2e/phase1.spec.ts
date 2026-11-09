import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const PW = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123";
const RUN = String(Date.now()).slice(-7);

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", PW);
  await page.click("button:has-text('دخول')");
  await page.waitForURL("**/dashboard");
}

async function fillPilgrim(page: Page, passportNo: string, tripLabel?: string) {
  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("fullNameAr", "عبدالله سالم محمود"); await f("familyName", "المولى");
  await page.selectOption("[name=gender]", "MALE");
  await f("birthDate", "12/05/1975"); await f("phone", "+964 770 123 4567");
  await f("passportNo", passportNo); await f("enGivenName", "ABDULLAH"); await f("enFatherName", "SALIM"); await f("enGrandfatherName", "MAHMOOD"); await f("enSurname", "ALMULA");
  await f("passportExpiry", "10/10/2031");
  const trip = tripLabel ? page.locator("label", { hasText: tripLabel }).locator("input[name=tripIds]").first() : page.locator("[name=tripIds]").first();
  await trip.check();
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
}

test("full flow: create pilgrim, attach to land trip, seat, manifest PDF, audit", async ({ page }) => {
  await login(page, "admin");
  const passport = `A1${RUN}`;
  await fillPilgrim(page, passport, "A-2612");
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  await expect(page.getByText(/^تم حفظ/)).toBeVisible();
  await page.getByRole("link", { name: "عبدالله سالم محمود المولى" }).first().click();
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}/);
  await expect(page.locator("h1")).toContainText("عبدالله سالم محمود المولى");

  // attach to trip
  await page.goto("/trips");
  await page.click("text=L-2611");
  await page.getByRole("button", { name: "إضافة معتمر" }).click();
  await page.getByLabel("بحث عن معتمر").fill(passport.toLowerCase());
  await expect(page.getByRole("dialog").getByText("A-2612")).toBeVisible(); // his other trip is shown
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإضافة" }).click();
  await expect(page.getByRole("dialog").getByText("مضاف").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("table").getByText(passport)).toBeVisible();

  // the new booking on a land trip is seated automatically: a seat map shows his name
  const busHrefs = await page.locator("a[href*='/bus/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  let seated = false;
  for (const h of busHrefs) {
    await page.goto(h);
    if (await page.getByText("عبدالله سالم محمود المولى").count()) { seated = true; break; }
  }
  expect(seated).toBe(true);

  // manifest PDF
  const tripUrl = page.url().split("/bus/")[0];
  const tripId = tripUrl.split("/").pop();
  const busLink = await page.request.get(`/api/trips/${tripId}/outputs/manifest?bus=${page.url().split("/bus/")[1]}&format=pdf`);
  expect(busLink.status()).toBe(200);
  expect(busLink.headers()["content-type"]).toBe("application/pdf");
  expect((await busLink.body()).subarray(0, 4).toString()).toBe("%PDF");
  const x = await page.request.get(`/api/trips/${tripId}/outputs/manifest?bus=${page.url().split("/bus/")[1]}&format=xlsx`);
  expect(x.status()).toBe(200);

  // edit name -> audit
  await page.goto(`/pilgrims?q=${passport}`);
  await page.click(`text=عبدالله سالم محمود المولى`);
  await page.fill("[name=fullNameAr]", "عبدالرحمن سالم محمود");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByText(/^تم حفظ/)).toBeVisible();
  await page.goto(`/audit?q=عبدالرحمن`);
  await expect(page.getByText("الاسم الأول").first()).toBeVisible();
  await expect(page.getByText("عبدالله").first()).toBeVisible();
});

test("duplicate passport is blocked with Arabic message", async ({ page }) => {
  await login(page, "reg");
  const passport = `A2${RUN}`;
  await fillPilgrim(page, passport);
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  await fillPilgrim(page, passport);
  await expect(page.getByText("رقم الجواز مسجّل مسبقاً لمعتمر آخر").first()).toBeVisible();
});

test("a trip is required for a new pilgrim; profile adds to several trips, skipping existing", async ({ page }) => {
  await login(page, "reg");
  await fillPilgrim(page, `A4${RUN}`);
  // fillPilgrim ticks the first trip; untick it to prove the field is required
  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("fullNameAr", "علي سالم محمود"); await f("familyName", "المولى");
  await page.selectOption("[name=gender]", "MALE");
  await f("birthDate", "12/05/1975"); await f("passportNo", `A3${RUN}`); await f("enGivenName", "ALI"); await f("enSurname", "ALMULA"); await f("passportExpiry", "10/10/2031");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByText("اختر رحلة واحدة على الأقل").first()).toBeVisible();
  // profile of the first pilgrim: first trip already added, add two more
  await page.goto("/pilgrims?q=" + `A4${RUN}`);
  await page.getByRole("link", { name: /المولى/ }).first().click();
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}/);
  await page.locator("summary:has-text('إضافة لرحلة')").click();
  const boxes = page.locator("details:has(summary:has-text('إضافة لرحلة')) [name=tripIds]:not([disabled])");
  await boxes.nth(0).check(); await boxes.nth(1).check();
  await page.click("button:has-text('إضافة للرحلات المحددة')");
  await expect(page.getByText(/أُضيف لـ 2/)).toBeVisible();
});

test("header search finds a pilgrim live and shows trips", async ({ page }) => {
  await login(page, "reg");
  await fillPilgrim(page, `A5${RUN}`);
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  await page.goto("/dashboard");
  await page.getByLabel("بحث شامل").fill(`a5${RUN}`);
  const hit = page.getByRole("link", { name: /عبدالله/ }).first();
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("المولى");
  await hit.click();
  await page.waitForURL(/\/pilgrims\/[0-9a-f-]{36}/);
});

test("passport type and phone rules (Iraqi / foreign passport, Iraqi / Saudi phone)", async ({ page }) => {
  await login(page, "reg");
  const base = async (passport: string, type: string, phone: string) => {
    await page.goto("/pilgrims/new");
    const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
    await f("fullNameAr", "اختبار جواز سالم"); await f("familyName", "الاختبار");
    await page.selectOption("[name=gender]", "MALE");
    await f("birthDate", "12/05/1975"); await f("enGivenName", "TEST"); await f("enSurname", "PASS"); await f("passportExpiry", "10/10/2031");
    await page.selectOption("[name=passportType]", type);
    await page.locator("[name=passportNo]").pressSequentially(passport);
    await f("phone", phone);
    await page.locator("[name=tripIds]").first().check();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
  };
  await base("n1234567", "IRAQI", "0501234567");
  await expect(page.getByText("رقم الجواز العراقي يجب أن يكون حرفاً إنكليزياً واحداً و8 أرقام").first()).toBeVisible();
  await expect(page.locator("[name=passportNo]")).toHaveValue("N1234567"); // shown in uppercase while typing
  await base("n1234567", "FOREIGN", "12345");
  await expect(page.getByText("رقم الهاتف يجب أن يكون عراقياً").first()).toBeVisible();
  await base(`n${RUN}`, "FOREIGN", "+966 50 123 4567");
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  await page.getByRole("link", { name: /اختبار جواز/ }).first().click();
  await expect(page.locator("[name=phone]")).toHaveValue("0501234567");
});

test("save buttons: save returns to the list as left, save-and-new keeps trip and agent, errors keep typed values", async ({ page }) => {
  await login(page, "reg");
  const fill = async (passport: string) => {
    const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
    await f("fullNameAr", "حفظ جديد سالم محمود"); await f("familyName", "المولى");
    await page.selectOption("[name=gender]", "MALE");
    await f("birthDate", "12/05/1975"); await f("passportNo", passport);
    await f("enGivenName", "SAVE"); await f("enSurname", "NEW"); await f("passportExpiry", "10/10/2031");
  };
  // the list as the user left it: a search text
  await page.goto("/pilgrims?q=" + encodeURIComponent("المولى"));
  await page.getByRole("link", { name: "+ معتمر جديد" }).click();
  await page.waitForURL(/\/pilgrims\/new\?.*returnTo=/);
  await fill("A7" + RUN);
  const trip = page.locator("input[name=tripIds]").nth(1);
  await trip.check();
  const tripId = await trip.getAttribute("value");
  await page.selectOption("[name=agentId]", { index: 1 });
  const agentId = await page.locator("[name=agentId]").inputValue();
  // error: duplicate passport of a seeded pilgrim -> stay, keep everything typed
  await page.fill("[name=passportNo]", "A10000137");
  await page.getByRole("button", { name: "حفظ وإضافة جديد" }).click();
  await expect(page.getByText("رقم الجواز مسجّل مسبقاً لمعتمر آخر").first()).toBeVisible();
  await expect(page.locator("[name=fullNameAr]")).toHaveValue("حفظ جديد سالم محمود");
  await expect(page.locator("[name=agentId]")).toHaveValue(agentId);
  await expect(page.locator(`input[name=tripIds][value="${tripId}"]`)).toBeChecked();
  // save and add new: a new empty form, same trip and agent, toast
  await page.fill("[name=passportNo]", "A7" + RUN);
  await page.getByRole("button", { name: "حفظ وإضافة جديد" }).click();
  await page.waitForURL(/\/pilgrims\/new\?.*saved=/);
  await expect(page.getByText(/^تم حفظ حفظ جديد/)).toBeVisible();
  await expect(page.locator("[name=fullNameAr]")).toHaveValue("");
  await expect(page.locator("[name=agentId]")).toHaveValue(agentId);
  await expect(page.locator(`input[name=tripIds][value="${tripId}"]`)).toBeChecked();
  // plain save returns to the list with the same search, toast and highlighted row
  await fill("A8" + RUN);
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForURL(/\/pilgrims\?.*saved=/);
  expect(decodeURIComponent(page.url())).toContain("q=المولى");
  await expect(page.getByText(/^تم حفظ حفظ جديد/)).toBeVisible();
  await expect(page.locator("tr.saved-row").first()).toBeVisible();
  // never opens a new form after plain save
  expect(page.url()).not.toContain("/pilgrims/new");
});

test("date fields add the slash automatically", async ({ page }) => {
  await login(page, "reg");
  await page.goto("/pilgrims/new");
  await page.locator("[name=birthDate]").pressSequentially("15112026");
  await expect(page.locator("[name=birthDate]")).toHaveValue("15/11/2026");
  await page.locator("[name=passportExpiry]").pressSequentially("1/2/2030");
  await expect(page.locator("[name=passportExpiry]")).toHaveValue("01/02/2030");
});

test("role permissions enforced on pages and routes", async ({ page, request }) => {
  const anon = await request.get("/api/trips/00000000-0000-0000-0000-000000000000/outputs/manifest", { maxRedirects: 0 });
  expect(anon.status()).toBe(401);
  await login(page, "acc");
  await page.goto("/users");
  await expect(page).toHaveURL(/forbidden/);
  await page.goto("/audit");
  await expect(page).toHaveURL(/forbidden/);
  await page.goto("/pilgrims/new");
  await expect(page).toHaveURL(/forbidden/);
  expect((await page.request.get("/api/documents/00000000-0000-0000-0000-000000000000")).status()).toBe(404); // document uploads were removed
  expect((await page.request.get("/api/trips/00000000-0000-0000-0000-000000000000/outputs/id-cards")).status()).toBe(404); // ID cards were removed
});

test("import wizard: 200 rows, bad rows reported, duplicates detected", async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["الاسم الأول", "اسم الأب", "اسم الجد", "اللقب", "الجنس", "تاريخ الميلاد", "رقم الجواز", "Given name", "Surname", "تاريخ الانتهاء", "الهاتف"]);
  for (let i = 0; i < 200; i++) {
    ws.addRow(["سعد", "خالد", "حمد", "النعيمي", "ذكر", "05/04/1970", `A${RUN.slice(-5)}${String(i).padStart(3, "0")}`, "SAAD", "ALNUAIMI", "01/01/2032", i % 40 === 5 ? "999" : "07701234567"]);
  }
  ws.addRow(["سعد", "خالد", "حمد", "النعيمي", "ذكر", "05/04/1970", `A${RUN.slice(-5)}000`, "SAAD", "ALNUAIMI", "01/01/2032", "07701234567"]); // dup inside file
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await login(page, "admin");
  await page.goto("/import");
  await page.selectOption("#import-trip", { index: 1 });
  await page.setInputFiles("input[type=file]", { name: "p.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.click("button:has-text('رفع')");
  await page.click("button:has-text('معاينة وفحص')");
  await expect(page.getByText("صفوف المعتمرين:")).toContainText("201");
  await expect(page.getByText("بأخطاء:")).toContainText("بأخطاء: 1"); // the in-file duplicate; the 5 bad phones are only ignored with a note
  await expect(page.getByText(/صف فيه قيم تم تجاهلها/)).toBeVisible();
  await page.click("button:has-text('تنفيذ الاستيراد')");
  await expect(page.getByText("تم الاستيراد")).toBeVisible();
  await expect(page.getByText(/أُضيف: 200/)).toBeVisible();
  const href = await page.locator("a:has-text('تنزيل تقرير الأخطاء')").getAttribute("href");
  const rep = await page.request.get(href!);
  expect(rep.status()).toBe(200);
});
