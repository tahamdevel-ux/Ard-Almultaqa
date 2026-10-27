import { defineConfig } from "@playwright/test";
import fs from "fs";

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = "/opt/pw-browsers";
  if (fs.existsSync(root)) for (const d of fs.readdirSync(root).filter((x) => x.startsWith("chromium-"))) {
    const p = `${root}/${d}/chrome-linux64/chrome`;
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 90_000,
  use: { baseURL: "http://localhost:3000", launchOptions: { executablePath: chromiumPath(), args: ["--no-sandbox"] }, locale: "ar" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
