#!/usr/bin/env node
/**
 * Three-way reconciliation: IM export ↔ PE buildImLinkedPricePath ↔ Excel IM Price Import
 * + PE outcomes after IM-aligned defaults (VOM €2, co2 from path).
 *
 * Usage:
 *   node Dashboard/tools/recon-im-pe-excel.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadDataFromDir } from "../im_engine/scenarioEngine.js";
import {
  buildImLinkedPricePath,
  runPlantEconomics,
  PE_DEFAULTS
} from "../plantEconomicsEngine.js";
import { DEFAULT_SCRUBBER } from "./export-im-price-path.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = join(__dirname, "..");
const ROOT = join(DASHBOARD, "..");
const EXPORT_DIR = join(ROOT, "Excel_model", "im_price_exports");
const XLSX = join(ROOT, "Excel_model", "Gas_Plant_v9_im_linked.xlsx");
const OUT_DIR = join(ROOT, "Excel_model", "im_price_exports");

const RECON_YEARS = [2030, 2035, 2040, 2045];
const METRICS = [
  ["ttf_eur_mwh", "ttfEurMwh", "TTF"],
  ["eua_eur_per_t", "euaEurPerT", "EUA"],
  ["srmc_eur_mwh", "srmcEurMwh", "SRMC"],
  ["P_gas", "P_gas", "P_gas"],
  ["P_res", "P_res", "P_res"]
];

const BLOCKS = {
  gas_m20: 1,
  gas_m15: 8,
  gas_m10: 15,
  base: 22,
  gas_p10: 29,
  gas_p15: 36,
  gas_p20: 43
};
const DATA_START = 30; // 1-based Excel row
const METRIC_COLS = {
  year: 0,
  ttf_eur_mwh: 1,
  eua_eur_per_t: 2,
  srmc_eur_mwh: 3,
  P_gas: 4,
  P_res: 5,
  avg_elec_eur_mwh: 6
};

function loadJson(label) {
  return JSON.parse(readFileSync(join(EXPORT_DIR, `${label}.json`), "utf8"));
}

function nearlyEq(a, b, eps = 1e-9) {
  if (a == null || b == null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Read Excel IM Price Import via ExcelJS if available, else fallback note. */
async function readExcelImport() {
  let ExcelJS;
  try {
    ExcelJS = (await import("exceljs")).default;
  } catch {
    // try openpyxl via python subprocess for values
    return null;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet("IM Price Import");
  if (!ws) throw new Error("IM Price Import sheet missing");
  const byCase = {};
  for (const [label, c0] of Object.entries(BLOCKS)) {
    const rows = [];
    for (let i = 0; i < 50; i++) {
      const r = DATA_START + i;
      const year = ws.getCell(r, c0).value;
      if (year == null || typeof year !== "number") break;
      rows.push({
        year,
        ttf_eur_mwh: ws.getCell(r, c0 + 1).value,
        eua_eur_per_t: ws.getCell(r, c0 + 2).value,
        srmc_eur_mwh: ws.getCell(r, c0 + 3).value,
        P_gas: ws.getCell(r, c0 + 4).value,
        P_res: ws.getCell(r, c0 + 5).value,
        avg_elec_eur_mwh: ws.getCell(r, c0 + 6).value
      });
    }
    byCase[label] = rows;
  }
  // Ass stamps
  const ass = wb.getWorksheet("Ass.");
  const scen = wb.getWorksheet("Scen. & Sensi.");
  const stamps = {
    D49: ass.getCell("D49").value,
    D37_formula: ass.getCell("D37").value,
    D56: ass.getCell("D56").value,
    D57: ass.getCell("D57").value,
    D62: ass.getCell("D62").value,
    D60: ass.getCell("D60").value,
    D61: ass.getCell("D61").value,
    Scen_G20: scen.getCell("G20").value
  };
  return { byCase, stamps };
}

function readExcelViaPython() {
  const { execFileSync } = await_import_child();
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook(${JSON.stringify(XLSX)}, data_only=False)
ws = wb["IM Price Import"]
BLOCKS = ${JSON.stringify(BLOCKS)}
DATA_START = ${DATA_START}
by_case = {}
for label, c0 in BLOCKS.items():
    rows = []
    for i in range(50):
        r = DATA_START + i
        year = ws.cell(r, c0).value
        if year is None or not isinstance(year, (int, float)):
            break
        rows.append({
            "year": int(year),
            "ttf_eur_mwh": ws.cell(r, c0+1).value,
            "eua_eur_per_t": ws.cell(r, c0+2).value,
            "srmc_eur_mwh": ws.cell(r, c0+3).value,
            "P_gas": ws.cell(r, c0+4).value,
            "P_res": ws.cell(r, c0+5).value,
            "avg_elec_eur_mwh": ws.cell(r, c0+6).value,
        })
    by_case[label] = rows
ass = wb["Ass."]
scen = wb["Scen. & Sensi."]
stamps = {
    "D49": ass["D49"].value,
    "D37_formula": str(ass["D37"].value),
    "D56": ass["D56"].value,
    "D57": ass["D57"].value,
    "D62": ass["D62"].value,
    "D60": ass["D60"].value,
    "D61": ass["D61"].value,
    "Scen_G20": scen["G20"].value,
}
gas = wb["Gas prc."]
# sample formula check
stamps["Gas_J7"] = str(gas["J7"].value)[:160]
stamps["Elec_J7"] = str(wb["Elec prc."]["J7"].value)[:160]
# orphan scan
import re
pat = re.compile(r"Ass\\\\.?!?\\\\$?D\\\\$?(5[2-8]|62)\\\\b", re.I)
orphans = []
for s in wb.worksheets:
    for row in s.iter_rows():
        for cell in row:
            v = cell.value
            if isinstance(v, str) and v.startswith("=") and pat.search(v):
                orphans.append(f"{s.title}!{cell.coordinate}")
stamps["orphan_anchor_refs"] = orphans
print(json.dumps({"byCase": by_case, "stamps": stamps}))
`;
  // fix escape - write to temp file instead
  return null;
}

function await_import_child() {
  return null;
}

function rowByYear(rows, year) {
  return rows.find((r) => r.year === year);
}

function pePathFor(data, ttfAdjustmentPct) {
  const years = [];
  for (let y = 2025; y <= 2060; y++) years.push(y);
  const imState = {
    solarPct: DEFAULT_SCRUBBER.solarPct,
    windPct: DEFAULT_SCRUBBER.windPct,
    windYear: DEFAULT_SCRUBBER.windYearType,
    demandScenario: DEFAULT_SCRUBBER.demandGrowthScenario,
    ttfAdjustmentPct
  };
  return buildImLinkedPricePath(data, imState, years);
}

function compareCase(label, ttfAdj, exportPayload, pePath, excelRows) {
  const issues = [];
  const table = [];
  for (const year of RECON_YEARS) {
    const im = rowByYear(exportPayload.rows, year);
    const pe = pePath.find((r) => (r.calendarYear ?? r.year) === year);
    const xl = excelRows ? rowByYear(excelRows, year) : null;
    const line = { year, metrics: {} };
    for (const [imKey, peKey, name] of METRICS) {
      const imV = im?.[imKey];
      const peV = pe?.[peKey];
      const xlV = xl?.[imKey];
      const dImPe = imV != null && peV != null ? imV - peV : null;
      const dImXl = imV != null && xlV != null ? imV - xlV : null;
      const dPeXl = peV != null && xlV != null ? peV - xlV : null;
      const ok =
        nearlyEq(imV, peV) &&
        (xlV == null || (nearlyEq(imV, xlV) && nearlyEq(peV, xlV)));
      if (!ok) {
        issues.push(
          `${label} ${year} ${name}: IM=${imV} PE=${peV} Excel=${xlV} d(IM-PE)=${dImPe} d(IM-XL)=${dImXl}`
        );
      }
      line.metrics[name] = {
        IM: imV,
        PE: peV,
        Excel: xlV,
        d_IM_PE: dImPe,
        d_IM_Excel: dImXl,
        d_PE_Excel: dPeXl,
        ok
      };
    }
    table.push(line);
  }
  return { label, ttfAdj, table, issues, allOk: issues.length === 0 };
}

function runOutcomes(data, ttfAdjustmentPct) {
  const path = pePathFor(data, ttfAdjustmentPct);
  const result = runPlantEconomics({ ...PE_DEFAULTS }, path);
  const am = result.amortization || {};
  const ops = (result.series || []).filter((r) => r.year >= (PE_DEFAULTS.codYear || 2030));
  const dispatchYears = ops.filter((r) => (r.mwhGeneration || 0) > 0).length;
  return {
    ttfAdjustmentPct,
    minDscr: result.minDscr,
    equityNpv: result.equityNpv,
    equityIrr: result.equityIrr,
    effectivelyBullet: am.effectivelyBullet,
    positiveScheduledYears: am.positiveScheduledYears,
    zeroScheduledYears: am.zeroScheduledYears,
    nonBalloonYears: am.nonBalloonYears,
    merchantDispatchYears: dispatchYears,
    operatingYears: ops.length
  };
}

async function main() {
  const data = loadDataFromDir(join(DASHBOARD, "im_data"), (p) =>
    readFileSync(p, "utf8")
  );

  // Excel via python (reliable; no exceljs dep required)
  const { execFileSync } = await import("child_process");
  const pyScript = join(OUT_DIR, "_read_excel_import.py");
  writeFileSync(
    pyScript,
    `
import json, openpyxl, re
XLSX = ${JSON.stringify(XLSX)}
BLOCKS = ${JSON.stringify(BLOCKS)}
DATA_START = ${DATA_START}
wb = openpyxl.load_workbook(XLSX, data_only=False)
ws = wb["IM Price Import"]
by_case = {}
for label, c0 in BLOCKS.items():
    rows = []
    for i in range(50):
        r = DATA_START + i
        year = ws.cell(r, c0).value
        if year is None or not isinstance(year, (int, float)):
            break
        rows.append({
            "year": int(year),
            "ttf_eur_mwh": float(ws.cell(r, c0+1).value),
            "eua_eur_per_t": float(ws.cell(r, c0+2).value),
            "srmc_eur_mwh": float(ws.cell(r, c0+3).value),
            "P_gas": float(ws.cell(r, c0+4).value),
            "P_res": float(ws.cell(r, c0+5).value),
            "avg_elec_eur_mwh": float(ws.cell(r, c0+6).value),
        })
    by_case[label] = rows
ass = wb["Ass."]
scen = wb["Scen. & Sensi."]
pat = re.compile(r"Ass\\.?!?\\$?D\\$?(5[2-8]|62)\\b", re.I)
orphans = []
for s in wb.worksheets:
    for row in s.iter_rows():
        for cell in row:
            v = cell.value
            if isinstance(v, str) and v.startswith("=") and pat.search(v):
                orphans.append(f"{s.title}!{cell.coordinate}")
print(json.dumps({
  "byCase": by_case,
  "stamps": {
    "D49": ass["D49"].value,
    "D37": str(ass["D37"].value),
    "D56": ass["D56"].value,
    "D57": ass["D57"].value,
    "D62": ass["D62"].value,
    "D60": ass["D60"].value,
    "D61": ass["D61"].value,
    "Scen_G20": scen["G20"].value,
    "Gas_J7": str(wb["Gas prc."]["J7"].value)[:200],
    "Elec_J7": str(wb["Elec prc."]["J7"].value)[:200],
    "orphan_anchor_refs": orphans,
  }
}))
`
  );
  const excelRaw = execFileSync("python3", [pyScript], { encoding: "utf8" });
  const excel = JSON.parse(excelRaw);

  const cases = [
    { label: "base", ttfAdj: 0 },
    { label: "gas_m20", ttfAdj: -20 },
    { label: "gas_p20", ttfAdj: 20 }
  ];

  const recon = [];
  for (const c of cases) {
    const exp = loadJson(c.label);
    const pe = pePathFor(data, c.ttfAdj);
    const xlRows = excel.byCase[c.label];
    recon.push(compareCase(c.label, c.ttfAdj, exp, pe, xlRows));
  }

  const outcomes = {
    base: runOutcomes(data, 0),
    gas_m20: runOutcomes(data, -20),
    gas_p20: runOutcomes(data, 20)
  };

  const report = {
    generatedAt: new Date().toISOString(),
    workbook: XLSX,
    scrubber: DEFAULT_SCRUBBER,
    excelStamps: excel.stamps,
    recon,
    outcomes,
    sensitivityInventory: {
      mapped_to_IM: [
        "Gas price shock −20/−10/+10/+20% → gas_m20/m10/p10/p20",
        "Spark-grid gas ±15% → gas_m15 / base / gas_p15"
      ],
      unmapped_no_IM_lever: [
        "Electricity price shock ±10/20% (Ass.!D60) — IM has no elec % lever",
        "Spark-grid electricity ±15% rows — same"
      ],
      non_price_keep_base_path: [
        "DSCR covenant",
        "Capex/MW",
        "Debt margin",
        "Tenor",
        "Availability",
        "Cost of equity",
        "Gearing"
      ],
      eua_note:
        "IM has absolute euaOverride only (not a % stress). Gas stresses re-export full endogenous EUA paths."
    }
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "recon_report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Console summary
  console.log("=== Excel stamps ===");
  console.log(JSON.stringify(excel.stamps, null, 2));
  console.log("\n=== Three-way recon (delta must be 0) ===");
  for (const r of recon) {
    console.log(`\n${r.label} (ttfAdj=${r.ttfAdj}) — ${r.allOk ? "PASS" : "FAIL"}`);
    for (const line of r.table) {
      const parts = Object.entries(line.metrics).map(([k, v]) => {
        const d = v.d_IM_Excel ?? v.d_IM_PE;
        return `${k}:IM=${fmt(v.IM)} PE=${fmt(v.PE)} XL=${fmt(v.Excel)} dXL=${fmt(v.d_IM_Excel)}`;
      });
      console.log(`  ${line.year}: ${parts.join(" | ")}`);
    }
    if (r.issues.length) console.log("  ISSUES:\n   ", r.issues.join("\n    "));
  }
  console.log("\n=== PE outcomes (IM-linked path, PE_DEFAULTS) ===");
  for (const [k, o] of Object.entries(outcomes)) {
    console.log(
      `${k}: minDSCR=${fmt(o.minDscr)} equityNPV=${fmt(o.equityNpv)} IRR=${o.equityIrr} ` +
        `bullet=${o.effectivelyBullet} scheduled=${o.positiveScheduledYears}/${o.nonBalloonYears} ` +
        `dispatchYears=${o.merchantDispatchYears}/${o.operatingYears}`
    );
  }
  console.log("\nWrote", outPath);
}

function fmt(x) {
  if (x == null) return "null";
  if (typeof x === "number") {
    if (!Number.isFinite(x)) return String(x);
    if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(3) + "m";
    return x.toFixed(6);
  }
  return String(x);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
