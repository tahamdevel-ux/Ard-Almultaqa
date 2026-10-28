import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let logoUri: string | null = null;
export function logoDataUri() {
  if (logoUri) return logoUri;
  const b = fs.readFileSync(path.join(process.cwd(), "public/brand/logo-192.png")).toString("base64");
  return (logoUri = `data:image/png;base64,${b}`);
}

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
body { font-family: 'NotoArabic', 'DejaVu Sans', sans-serif; font-size: 11px; color: #1f2120; margin: 0; }
.hdr { display:flex; align-items:center; gap:10px; padding-bottom:8px; margin-bottom:10px; border-bottom: 3px solid #e3b02e; }
.hdr img { width: 54px; height: 54px; flex: none; }
.hdr .co { flex: 1; }
.hdr h1 { margin: 0; font-size: 16px; color: #3b3f32; }
.hdr small { color: #6b7157; display:block; font-size: 10px; }
.hdr .doc { text-align: left; }
.hdr .doc b { display:block; font-size: 14px; color: #3b3f32; }
h2 { font-size: 13px; margin: 6px 0; color: #3b3f32; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #d9dbcf; padding: 4px 6px; text-align: right; }
th { background: #4f5444; color: #fff; font-weight: 700; }
tbody tr:nth-child(even) td { background: #f6f6f2; }
.ltr { direction: ltr; unicode-bidi: plaintext; text-align: left; }
.num { text-align:center; width: 28px; }
tr { page-break-inside: avoid; }
.foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #d9dbcf; font-size: 9.5px; color:#6b7157; text-align:center; }
`;

export function pageHtml(company: { name: string; address: string; phones: string }, title: string, meta: string, body: string, dir: "rtl" | "ltr" = "rtl") {
  return `<!doctype html><html lang="ar" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS.replace("/*fonts*/", fonts())}</style></head><body>
<div class="hdr"><img src="${logoDataUri()}" alt=""><div class="co"><h1>${esc(company.name)}</h1><small>${esc(company.address)} ${esc(company.phones)}</small></div>
<div class="doc"><b>${esc(title)}</b><small>${meta}</small></div></div>
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
