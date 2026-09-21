#!/usr/bin/env node
/**
 * Print takeaways-slides.html → PDF via Playwright (live charts, not screenshots).
 *
 * Usage:
 *   node scripts/export-takeaways-pdf.mjs
 *   node scripts/export-takeaways-pdf.mjs --url http://127.0.0.1:8765/takeaways-slides.html
 */
import { chromium } from "playwright";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "aspect-test-output");
const outPdf = join(outDir, "takeaways-7-slides.pdf");
const publicPdf = join(root, "downloads", "takeaways.pdf");
const urlArg = process.argv.find((a) => a.startsWith("--url="));
const base =
  urlArg?.slice(6) ||
  process.env.TAKEAWAYS_URL ||
  "http://127.0.0.1:8765/takeaways-slides.html?v=" + Date.now();

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(publicPdf), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1320, height: 900 },
  deviceScaleFactor: 1
});

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

console.log("goto", base);
await page.goto(base, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(
  () => window.__TAKEAWAYS_LIVE__ && window.__TAKEAWAYS_LIVE__.ready === true,
  { timeout: 120000 }
);
await page.evaluate(() => document.fonts && document.fonts.ready);
// Let Plotly finish layout
await page.waitForTimeout(1500);

const live = await page.evaluate(() => window.__TAKEAWAYS_LIVE__);
console.log("LIVE slide-6 figures:", JSON.stringify(live, null, 2));

// Sanity: non-zero PE headlines
if (!live.pe0 || Math.abs(live.pe0.npv) < 1e6) {
  throw new Error("Slide 6 pe0 NPV looks stale/zero: " + live.pe0?.npv);
}
if (!live.pe1 || live.pe1.npv > -1e8) {
  throw new Error("Slide 6 pe1 NPV unexpected: " + live.pe1?.npv);
}

await page.pdf({
  path: outPdf,
  width: "1280px",
  height: "720px",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true
});

console.log("wrote", outPdf);
copyFileSync(outPdf, publicPdf);
console.log("wrote", publicPdf);
if (errors.length) {
  console.log("page errors:", errors.slice(0, 10));
}
await browser.close();
