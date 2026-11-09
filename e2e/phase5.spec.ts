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
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد الإضافة" }).click();
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

test("smart import: header on row 4, (A)/(E) headers, mixed dates, junk rows, existing passport added to the chosen trip", async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["قائمة معتمرين وهمية"]); ws.addRow([]); ws.addRow(["تاريخ", "01/01/2026"]);
  ws.addRow(["[]", "Y", "Passport Number", "AFull Name", "First Name (A)", "Father Name (A)", "Third Name (A)", "Last Name (A)", "First Name (E)", "Father Name (E)", "Third Name (E)", "Last Name (E)",
    "Nationality", "Birth Date", "Issue Date", "Expiry Date", "Gender", "Mahram", "Visa Number", "Phone"]);
  const mk = (i: number, extra: Partial<Record<number, unknown>> = {}) => {
    const r: unknown[] = [i, "Y", `A${RUN}${i}`, "تجريب كامل", "تجريب", "علي", "حسن", "الاختبار", "TEST", "ALI", "HASSAN", "ALEKHTIBAR", "Iraq", "07-01-1963", new Date(Date.UTC(2025, 8, 21)), "20-09-2033", i % 2 ? "Male" : "Female", "ignored", "123", 7701234567];
    for (const [k, v] of Object.entries(extra)) r[+k] = v;
    return r;
  };
  ws.addRow(mk(1)); ws.addRow(mk(2)); ws.addRow([]); ws.addRow(["المجموع", 2]); ws.addRow(mk(3));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await login(page, "admin");
  // pilgrim 3 already exists (registered by hand earlier)
  await page.goto("/pilgrims/new");
  const f = (n: string, v: string) => page.fill(`[name=${n}]`, v);
  await f("fullNameAr", "قديم أ ب"); await f("familyName", "ج");
  await page.selectOption("[name=gender]", "MALE"); await f("birthDate", "01/01/1970"); await f("passportNo", `A${RUN}3`);
  await f("enGivenName", "OLD"); await f("enSurname", "ONE"); await f("passportExpiry", "01/01/2031");
  await page.locator("[name=tripIds]").first().check();
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.waitForURL(/\/pilgrims\?.*saved=/);

  await page.goto("/trips/new");
  await page.fill("[name=name]", `استيراد ذكي ${RUN}`);
  await page.click("button:has-text('إنشاء')");
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();

  await page.goto("/import");
  await page.selectOption("#import-trip", { label: new RegExp(`استيراد ذكي ${RUN}`) as never }).catch(async () => {
    const opt = page.locator("#import-trip option", { hasText: `استيراد ذكي ${RUN}` });
    await page.selectOption("#import-trip", (await opt.first().getAttribute("value"))!);
  });
  await page.setInputFiles("input[type=file]", { name: "smart.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.click("button:has-text('رفع')");
  await expect(page.locator("#hdr")).toHaveValue("4");
  await page.click("button:has-text('معاينة وفحص')");
  await expect(page.getByText("صفوف المعتمرين:")).toContainText("3"); // total line is junk, ignored silently
  await expect(page.getByText("مسجّل مسبقاً:")).toContainText("1");
  await page.click("button:has-text('تنفيذ الاستيراد')");
  await expect(page.getByText("تم الاستيراد")).toBeVisible();
  await expect(page.getByText(/أُضيف: 2/)).toBeVisible();
  await expect(page.getByText(/مسجّلون أُضيفوا للرحلة: 1/)).toBeVisible();

  await page.goto(tripUrl);
  await expect(page.getByText("المعتمرون (3)")).toBeVisible();
  // the existing pilgrim's data was not changed
  await page.goto(`/pilgrims?q=A${RUN}3`);
  await expect(page.getByText("قديم").first()).toBeVisible();
});
