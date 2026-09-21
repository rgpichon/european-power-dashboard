import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "aspect-test-output");
const BASE = "http://127.0.0.1:8765/tools/map-aspect-test.html";

const VARIANTS = [
  { id: "A0-baseline", lon: [-95, 54], lat: [18, 68], projection: "natural earth" },
  { id: "A1-tight-23-72", lon: [-95, 54], lat: [23, 72], projection: "natural earth" },
  { id: "A2-tight-22-71", lon: [-95, 54], lat: [22, 71], projection: "natural earth" },
  { id: "A3-tight-24-71", lon: [-95, 54], lat: [24, 71], projection: "natural earth" },
  { id: "A4-tight-lon-lat", lon: [-94, 52], lat: [23, 72], projection: "natural earth" },
  { id: "B1-mercator", lon: [-95, 54], lat: [23, 72], projection: "mercator" },
  { id: "B2-miller", lon: [-95, 54], lat: [23, 72], projection: "miller" },
  { id: "B3-equirectangular", lon: [-95, 54], lat: [23, 72], projection: "equirectangular" }
];

function url(v) {
  const p = new URLSearchParams({
    lon: JSON.stringify(v.lon),
    lat: JSON.stringify(v.lat),
    proj: v.projection
  });
  return BASE + "?" + p.toString();
}

async function main() {
  console.log("Starting aspect tests (standalone page)...");
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 560 } });
  const results = [];

  for (const v of VARIANTS) {
    console.log("Testing", v.id);
    await page.goto(url(v), { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForSelector("body[data-ready='1']", { timeout: 45000 });
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => window.__MAP_METRICS);
    const shot = path.join(OUT, v.id + ".png");
    await page.locator("#test-map").screenshot({ path: shot });
    results.push({ ...v, metrics, screenshot: v.id + ".png" });
    console.log(
      "  fillH=" + metrics.fillHeightPct + "% fillW=" + metrics.fillWidthPct +
      "% aspect=" + metrics.renderedAspect + " qatar=" + (metrics.qatarVisible ? "ok" : "NO")
    );
  }

  await browser.close();
  await writeFile(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const ranked = [...results].sort((a, b) => b.metrics.fillHeightPct - a.metrics.fillHeightPct);
  console.log("\nRanked by fillHeightPct:");
  ranked.forEach((r, i) => console.log((i + 1) + ". " + r.id + " — " + r.metrics.fillHeightPct + "%"));
}

main().catch((e) => { console.error(e); process.exit(1); });
