#!/usr/bin/env node
/**
 * Export Interaction Model year-by-year price paths for Excel / PE reconciliation.
 *
 * Re-runnable whenever article default scrubber settings change.
 *
 * Usage:
 *   node tools/export-im-price-path.mjs
 *   node tools/export-im-price-path.mjs --ttfAdjustmentPct=-20 --label=gas_m20
 *   node tools/export-im-price-path.mjs --all-gas-stresses
 *
 * Outputs (under Excel_model/im_price_exports/):
 *   <label>.json  — full stamped payload
 *   <label>.csv   — year,ttf,eua,srmc,P_gas,P_res,avg_elec
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadDataFromDir } from "../im_engine/scenarioEngine.js";
import { buildImLinkedPricePath } from "../plantEconomicsEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = join(__dirname, "..");
const IM_DATA = join(DASHBOARD, "im_data");
const OUT_DIR = join(DASHBOARD, "..", "Excel_model", "im_price_exports");

/** Article / dashboard default scrubber (IMState defaults, no gas stress). */
export const DEFAULT_SCRUBBER = {
  solarPct: 100,
  windPct: 100,
  windYearType: "base",
  demandGrowthScenario: "B",
  ttfAdjustmentPct: 0
};

const GAS_STRESS_CASES = [
  { label: "base", ttfAdjustmentPct: 0 },
  { label: "gas_m20", ttfAdjustmentPct: -20 },
  { label: "gas_m15", ttfAdjustmentPct: -15 },
  { label: "gas_m10", ttfAdjustmentPct: -10 },
  { label: "gas_p10", ttfAdjustmentPct: 10 },
  { label: "gas_p15", ttfAdjustmentPct: 15 },
  { label: "gas_p20", ttfAdjustmentPct: 20 }
];

function parseArgs(argv) {
  const out = {
    label: "base",
    scrubber: { ...DEFAULT_SCRUBBER },
    yearFrom: 2025,
    yearTo: 2060,
    allGasStresses: false
  };
  for (const a of argv.slice(2)) {
    if (a === "--all-gas-stresses") out.allGasStresses = true;
    else if (a.startsWith("--label=")) out.label = a.slice(8);
    else if (a.startsWith("--ttfAdjustmentPct=")) {
      out.scrubber.ttfAdjustmentPct = Number(a.split("=")[1]);
    } else if (a.startsWith("--solarPct=")) {
      out.scrubber.solarPct = Number(a.split("=")[1]);
    } else if (a.startsWith("--windPct=")) {
      out.scrubber.windPct = Number(a.split("=")[1]);
    } else if (a.startsWith("--windYearType=")) {
      out.scrubber.windYearType = a.split("=")[1];
    } else if (a.startsWith("--demandGrowthScenario=")) {
      out.scrubber.demandGrowthScenario = a.split("=")[1];
    } else if (a.startsWith("--yearFrom=")) out.yearFrom = Number(a.split("=")[1]);
    else if (a.startsWith("--yearTo=")) out.yearTo = Number(a.split("=")[1]);
  }
  return out;
}

function yearsRange(from, to) {
  const y = [];
  for (let i = from; i <= to; i++) y.push(i);
  return y;
}

export function exportPricePath(data, scrubber, years, meta) {
  const imState = {
    solarPct: scrubber.solarPct,
    windPct: scrubber.windPct,
    windYear: scrubber.windYearType,
    demandScenario: scrubber.demandGrowthScenario,
    ttfAdjustmentPct: scrubber.ttfAdjustmentPct
  };
  const path = buildImLinkedPricePath(data, imState, years);
  const rows = path.map((r) => ({
    year: r.calendarYear != null ? r.calendarYear : r.year,
    ttf_eur_mwh: r.ttfEurMwh,
    eua_eur_per_t: r.euaEurPerT,
    srmc_eur_mwh: r.srmcEurMwh,
    P_gas: r.P_gas,
    P_res: r.P_res,
    avg_elec_eur_mwh: r.electricityEurMwh,
    S_gas: r.S_gas,
    S_neg: r.S_neg,
    S_res: r.S_res,
    co2PerGasMwh: r.co2PerGasMwh,
    extrapolatedPastImHorizon: !!r.extrapolatedPastImHorizon
  }));
  return {
    meta: {
      ...meta,
      scrubber: { ...scrubber },
      yearFrom: years[0],
      yearTo: years[years.length - 1],
      nYears: years.length,
      script: "Dashboard/tools/export-im-price-path.mjs",
      engine: "im_engine/scenarioEngine.js + plantEconomicsEngine.buildImLinkedPricePath",
      imDataDir: "Dashboard/im_data/",
      exportedAt: new Date().toISOString(),
      note:
        "IM has ttfAdjustmentPct for gas stress and euaOverride (absolute €/t) — no electricity-price % lever."
    },
    rows
  };
}

function writeExport(payload, label) {
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `${label}.json`);
  const csvPath = join(OUT_DIR, `${label}.csv`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  const header =
    "year,ttf_eur_mwh,eua_eur_per_t,srmc_eur_mwh,P_gas,P_res,avg_elec_eur_mwh";
  const lines = payload.rows.map((r) =>
    [
      r.year,
      r.ttf_eur_mwh,
      r.eua_eur_per_t,
      r.srmc_eur_mwh,
      r.P_gas,
      r.P_res,
      r.avg_elec_eur_mwh
    ].join(",")
  );
  writeFileSync(csvPath, [header, ...lines].join("\n") + "\n");
  return { jsonPath, csvPath };
}

function main() {
  const args = parseArgs(process.argv);
  const data = loadDataFromDir(IM_DATA, (p) => readFileSync(p, "utf8"));
  const years = yearsRange(args.yearFrom, args.yearTo);

  const cases = args.allGasStresses
    ? GAS_STRESS_CASES
    : [
        {
          label: args.label,
          ttfAdjustmentPct: args.scrubber.ttfAdjustmentPct
        }
      ];

  const written = [];
  for (const c of cases) {
    const scrubber = { ...DEFAULT_SCRUBBER, ttfAdjustmentPct: c.ttfAdjustmentPct };
    const payload = exportPricePath(data, scrubber, years, {
      scenarioName: c.label,
      command: args.allGasStresses
        ? "node tools/export-im-price-path.mjs --all-gas-stresses"
        : `node tools/export-im-price-path.mjs --label=${c.label} --ttfAdjustmentPct=${c.ttfAdjustmentPct}`
    });
    const paths = writeExport(payload, c.label);
    written.push({ label: c.label, ...paths, n: payload.rows.length });
    console.log(
      `Wrote ${c.label}: ${paths.jsonPath} (${payload.rows.length} years, ttfAdj=${c.ttfAdjustmentPct})`
    );
  }

  // Manifest for Excel rewire
  const manifest = {
    exportedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    defaultScrubber: DEFAULT_SCRUBBER,
    cases: written.map((w) => w.label),
    unmappedExcelSensitivities: [
      {
        name: "Electricity price shock (±10/20%)",
        reason:
          "IM engine has no electricity-price % lever (only ttfAdjustmentPct and absolute euaOverride)."
      },
      {
        name: "Spark spread grid — electricity shock dimension (±15%)",
        reason: "Same — no IM elec % lever; gas dimension (±15%) is exported."
      }
    ]
  };
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Manifest:", join(OUT_DIR, "manifest.json"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
