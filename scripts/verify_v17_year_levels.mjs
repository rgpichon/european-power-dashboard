#!/usr/bin/env node
/**
 * Year-by-year LEVEL comparison vs /tmp/v17_d11_{0,1}_verify.csv
 * (CSV must be dumped from live Excel).
 *
 * Always prints absolute Excel + JS values, then Δ.
 * Never Δ-only — a perfect match would otherwise look like all zeros.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadDataFromDir } from '../im_engine/scenarioEngine.js';
import {
  buildImLinkedPricePath,
  runPlantEconomics,
  PE_DEFAULTS,
  excelModelYears,
} from '../plantEconomicsEngine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = loadDataFromDir(join(root, 'im_data'), readFileSync);
const years = excelModelYears(PE_DEFAULTS);
const path = buildImLinkedPricePath(
  data,
  { solarPct: 100, windPct: 100, windYear: 'base', demandScenario: 'B', ttfAdjustmentPct: 0 },
  years,
);

function loadCsv(tag) {
  return readFileSync(`/tmp/v17_${tag}_verify.csv`, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => {
      const p = l.split(',');
      return {
        year: +p[0],
        mwh: +p[1],
        revenue: +p[2],
        fuel: +p[3],
        carbon: +p[4],
        ebitda: +p[5],
        cfads: +p[6],
        principal: +p[7],
        interest: +p[8],
        netEqCF: +p[11],
      };
    });
}

const map = [
  ['mwh', 'mwhGeneration'],
  ['revenue', 'revenue'],
  ['fuel', 'fuelCost'],
  ['carbon', 'carbonCost'],
  ['ebitda', 'ebitda'],
  ['cfads', 'cfads'],
  ['principal', 'principal'],
  ['interest', 'interest'],
  ['netEqCF', 'equityCashFlow'],
];

let failed = false;
for (const [tag, construction] of [
  ['d11_0', 0],
  ['d11_1', 1],
]) {
  const pe = runPlantEconomics({ ...PE_DEFAULTS, construction }, path);
  const ex = loadCsv(tag);
  console.log(`\n## ${tag}  JS NPV=${pe.equityNpv} IRR=${pe.equityIrr} cross=${pe.crossoverYear}`);
  console.log('year | side | mwh | revenue | fuel | carbon | ebitda | cfads | principal | interest | equityCF');

  let maxAbs = 0;
  let worst = null;
  for (const y of [2027, 2028, 2029, 2030, 2031, 2040, 2049]) {
    const e = ex.find((r) => r.year === y);
    const r = pe.series.find((s) => s.year === y);
    if (!e || !r) throw new Error(`missing ${tag} ${y}`);
    const js = Object.fromEntries(map.map(([ef, jf]) => [ef, r[jf]]));
    console.log(
      `${y} | Excel | ${e.mwh} | ${e.revenue} | ${e.fuel} | ${e.carbon} | ${e.ebitda} | ${e.cfads} | ${e.principal} | ${e.interest} | ${e.netEqCF}`,
    );
    console.log(
      `${y} | JS    | ${js.mwh} | ${js.revenue} | ${js.fuel} | ${js.carbon} | ${js.ebitda} | ${js.cfads} | ${js.principal} | ${js.interest} | ${js.netEqCF}`,
    );
    const deltas = map.map(([ef]) => {
      const d = (js[ef] || 0) - (e[ef] || 0);
      if (Math.abs(d) > maxAbs) {
        maxAbs = Math.abs(d);
        worst = { y, f: ef, d };
      }
      if (Math.abs(d) >= 0.01) failed = true;
      return d;
    });
    console.log(`${y} | Δ     | ${deltas.join(' | ')}`);
  }
  const y2030 = pe.series.find((s) => s.year === 2030);
  console.log(
    `NON-ZERO 2030: hrsGas=${y2030.hrsGas} mwh=${y2030.mwhGeneration} revenue=${y2030.revenue}`,
  );
  console.log('worst abs Δ', worst);
}

if (failed) {
  console.error('\nCENT-LEVEL FAILURE');
  process.exit(1);
}
console.log('\nAll sampled years within €0.01 of live Excel.');
