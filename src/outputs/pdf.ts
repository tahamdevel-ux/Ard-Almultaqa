import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let fontCss: string | null = null;
function fonts() {
  if (fontCss) return fontCss;
  const dir = path.join(process.cwd(), "public/fonts");
  const face = (w: number) => {
    const b64 = fs.readFileSync(path.join(dir, `noto-sans-arabic-arabic-${w}-normal.woff2`)).toString("base64");
    return `@font-face{font-family:'NotoArabic';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  };
  return (fontCss = face(400) + face(700));
}

function findChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const def = chromium.executablePath();
  if (fs.existsSync(def)) return undefined;
  const root = "/opt/pw-browsers";
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith("chromium-"))) {
      const p = path.join(root, d, "chrome-linux64", "chrome");
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

export const BASE_CSS = `
${"/*fonts*/"}
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: 'NotoArabic', 'DejaVu Sans', sans-serif; font-size: 11px; color: #111; margin: 0; }
.hdr { border-bottom: 2px solid #0f5132; padding-bottom: 6px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:flex-end; }
.hdr h1 { margin: 0; font-size: 17px; color: #0f5132; }
.hdr small { color: #444; display:block; }
h2 { font-size: 13px; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 3px 5px; text-align: right; }
th { background: #e8efe9; }
.ltr { direction: ltr; unicode-bidi: plaintext; text-align: left; }
.num { text-align:center; width: 28px; }
tr { page-break-inside: avoid; }
.foot { margin-top: 10px; font-size: 10px; color:#555; }
`;

export function pageHtml(company: { name: string; address: string; phones: string }, title: string, meta: string, body: string, dir: "rtl" | "ltr" = "rtl") {
  return `<!doctype html><html lang="ar" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS.replace("/*fonts*/", fonts())}</style></head><body>
<div class="hdr"><div><h1>${esc(company.name)}</h1><small>${esc(company.address)} ${esc(company.phones)}</small></div>
<div style="text-align:left"><b>${esc(title)}</b><small>${meta}</small></div></div>
${body}
<div class="foot">${esc(company.name)} — ${esc(company.address)} — ${esc(company.phones)}</div>
</body></html>`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  let launch: Parameters<typeof chromium.launch>[0];
  if (process.env.VERCEL || process.env.USE_SPARTICUZ_CHROMIUM) {
    // Serverless: a compressed Chromium build that fits in a function.
    const sparticuz = (await import("@sparticuz/chromium")).default;
    launch = { executablePath: await sparticuz.executablePath(), args: sparticuz.args, headless: true };
  } else {
    launch = { executablePath: findChromium(), args: ["--no-sandbox"] };
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" } }));
  } finally {
    await browser.close();
  }
}
