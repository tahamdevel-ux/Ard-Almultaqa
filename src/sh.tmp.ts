import { chromium } from "playwright";
import fs from "fs";
(async () => {
  const S = process.argv[2] + "/d";
  const exe = fs.readdirSync("/opt/pw-browsers").filter((x) => x.startsWith("chromium-")).map((d) => `/opt/pw-browsers/${d}/chrome-linux64/chrome`).find((p) => fs.existsSync(p));
  const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" })).newPage();
  await page.goto("http://localhost:3000/login"); await page.screenshot({ path: `${S}/1-login.png` });
  await page.fill("#username", "admin"); await page.fill("#password", "ChangeMe123"); await page.click("button:has-text('دخول')"); await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${S}/2-dashboard.png`, fullPage: true });
  await page.goto("http://localhost:3000/pilgrims"); await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${S}/3-pilgrims.png` });
  await page.goto("http://localhost:3000/trips"); await page.click("a:has-text('L-2611')"); await page.waitForURL(/trips\/[0-9a-f-]{36}$/); await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${S}/4-trip.png` });
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar" })).newPage();
  await m.goto("http://localhost:3000/login"); await m.screenshot({ path: `${S}/5-m-login.png` });
  await m.fill("#username", "admin"); await m.fill("#password", "ChangeMe123"); await m.click("button:has-text('دخول')"); await m.waitForURL("**/dashboard"); await m.waitForLoadState("networkidle"); await m.screenshot({ path: `${S}/6-m-dashboard.png` });
  await b.close();
})();
