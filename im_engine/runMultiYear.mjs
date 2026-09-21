#!/usr/bin/env node
/**
 * Multi-year Interaction Model chain: 2025–2045.
 *
 * Capacity:
 *   2025 Ember → 2030 EEG (215/115) linear
 *   2031–2045: continue the 2030→2040 linear rate (18.5 GW solar / 4.5 GW wind
 *   per year) past the last stated EEG target year — extrapolation, not policy.
 *
 * Demand: Scenario B two-segment (g1 to 2037, g2 2038–2045).
 * Wind year type: base. TTF adjustment: 0%.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadDataFromDir, runScenario } from "./scenarioEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "im_data");

const CAP = {
  2025: null,
  2030: { solar: 215, wind: 115 },
  2040: { solar: 400, wind: 160 },
};

const RATE = {
  solarPerYear: (400 - 215) / (2040 - 2030),
  windPerYear: (160 - 115) / (2040 - 2030),
};

const START_YEAR = 2025;
const END_YEAR = 2045;

const data = loadDataFromDir(DATA, readFileSync);
const hist2025 = data.historical.years.find((y) => y.year === 2025);
CAP[2025] = {
  solar: hist2025.capacity_gw_ember.solar,
  wind: hist2025.capacity_gw_ember.wind,
};

function lerp(a, b, t) {
  return a + t * (b - a);
}

function capacityAt(year) {
  if (year <= 2025) return { ...CAP[2025], extrapolated_past_2040: false };
  if (year <= 2030) {
    const t = (year - 2025) / (2030 - 2025);
    return {
      solar: lerp(CAP[2025].solar, CAP[2030].solar, t),
      wind: lerp(CAP[2025].wind, CAP[2030].wind, t),
      extrapolated_past_2040: false,
    };
  }
  const yearsPast2030 = year - 2030;
  return {
    solar: CAP[2030].solar + yearsPast2030 * RATE.solarPerYear,
    wind: CAP[2030].wind + yearsPast2030 * RATE.windPerYear,
    extrapolated_past_2040: year > 2040,
  };
}

const CAPACITY_PATH_META = {
  policy_targets: {
    2030: CAP[2030],
    2040: CAP[2040],
    note: "EEG / statutory — last stated German target year is 2040",
  },
  post_2040: {
    method: "continue_2030_to_2040_linear_rate",
    solar_gw_per_year: RATE.solarPerYear,
    wind_gw_per_year: RATE.windPerYear,
    policy_sourced: false,
    flag: "extrapolation_past_last_stated_target_year",
    rationale:
      "No official capacity target past 2040. Chain continues the already-established 2030→2040 linear rate through 2045 rather than inserting an artificial flat stop at the 2040 EEG levels.",
  },
};

const rows = [];
for (let year = START_YEAR; year <= END_YEAR; year++) {
  const cap = capacityAt(year);
  const result = runScenario(data, {
    year,
    demandGrowthScenario: "B",
    solarCapacityGW: cap.solar,
    windCapacityGW: cap.wind,
    windYearType: "base",
    supplyScenario: "base_case",
    ttfAdjustmentPct: 0,
    capacityPathMeta: {
      ...CAPACITY_PATH_META,
      year_extrapolated_past_2040: cap.extrapolated_past_2040,
    },
  });
  rows.push({
    year,
    demand_twh: result.demand.demand_year_twh,
    solar_gw: cap.solar,
    wind_gw: cap.wind,
    extrapolated_past_2040: cap.extrapolated_past_2040,
    ttf_eur_mwh: result.commodities.ttf_eur_mwh,
    avg_price_eur_mwh: result.annual.avg_price_eur_mwh,
    gas_margin_eur_per_mw: result.gas_dispatch.annual.gross_margin_eur_per_mw,
    vre_share: result.annual.vre_share_of_demand,
    capacity_path_flag: result.methodology.capacity_path?.flag ?? null,
  });
}

const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

console.log(
  "year | demand_TWh | solar_GW | wind_GW | TTF_€/MWh | avg_price | gas_margin_€/MW | cap_note"
);
console.log("-".repeat(125));
for (const r of rows) {
  const note =
    r.year <= 2030
      ? "→EEG2030"
      : r.year <= 2040
        ? "→EEG2040 rate"
        : "EXTRAPOLATE past 2040";
  console.log(
    `${r.year} | ${round(r.demand_twh, 1).toFixed(1).padStart(7)} | ${round(r.solar_gw, 2)
      .toFixed(2)
      .padStart(7)} | ${round(r.wind_gw, 2)
      .toFixed(2)
      .padStart(7)} | ${round(r.ttf_eur_mwh, 2)
      .toFixed(2)
      .padStart(8)} | ${round(r.avg_price_eur_mwh, 2)
      .toFixed(2)
      .padStart(8)} | ${round(r.gas_margin_eur_per_mw, 0)
      .toString()
      .padStart(8)} | ${note}`
  );
}

const y40 = rows.find((r) => r.year === 2040);
const y41 = rows.find((r) => r.year === 2041);
const y45 = rows.find((r) => r.year === 2045);

console.log("\n=== 2045 endpoints ===");
console.log(
  JSON.stringify(
    {
      demand_twh: round(y45.demand_twh, 2),
      solar_gw: round(y45.solar_gw, 2),
      wind_gw: round(y45.wind_gw, 2),
      ttf_eur_mwh: round(y45.ttf_eur_mwh, 2),
      avg_price_eur_mwh: round(y45.avg_price_eur_mwh, 2),
      gas_margin_eur_per_mw: round(y45.gas_margin_eur_per_mw, 0),
      vre_share: round(y45.vre_share, 3),
      capacity_flag: "extrapolation_past_last_stated_target_year",
      vs_prior_flat_at_2040_eeg: {
        prior_solar_gw: 400,
        prior_wind_gw: 160,
        prior_margin: 75619,
        solar_delta_gw: round(y45.solar_gw - 400, 2),
        wind_delta_gw: round(y45.wind_gw - 160, 2),
        margin_delta: round(y45.gas_margin_eur_per_mw - 75619, 0),
      },
    },
    null,
    2
  )
);

console.log("\n=== 2040→2041 boundary (extrapolation begins) ===");
console.log(
  JSON.stringify(
    {
      rate_solar_gw_per_year: RATE.solarPerYear,
      rate_wind_gw_per_year: RATE.windPerYear,
      solar_2040: round(y40.solar_gw, 2),
      solar_2041: round(y41.solar_gw, 2),
      solar_step: round(y41.solar_gw - y40.solar_gw, 2),
      wind_2040: round(y40.wind_gw, 2),
      wind_2041: round(y41.wind_gw, 2),
      wind_step: round(y41.wind_gw - y40.wind_gw, 2),
      matches_prior_decade_rate:
        Math.abs(y41.solar_gw - y40.solar_gw - RATE.solarPerYear) < 1e-9 &&
        Math.abs(y41.wind_gw - y40.wind_gw - RATE.windPerYear) < 1e-9,
      demand_step_pct: round(100 * (y41.demand_twh / y40.demand_twh - 1), 2),
      ttf_step_pct: round(100 * (y41.ttf_eur_mwh / y40.ttf_eur_mwh - 1), 2),
      avg_price_2040: round(y40.avg_price_eur_mwh, 2),
      avg_price_2041: round(y41.avg_price_eur_mwh, 2),
      avg_price_step: round(y41.avg_price_eur_mwh - y40.avg_price_eur_mwh, 2),
      margin_2040: round(y40.gas_margin_eur_per_mw, 0),
      margin_2041: round(y41.gas_margin_eur_per_mw, 0),
      margin_step: round(y41.gas_margin_eur_per_mw - y40.gas_margin_eur_per_mw, 0),
      vre_2040: round(y40.vre_share, 3),
      vre_2041: round(y41.vre_share, 3),
      methodology_flag: y41.capacity_path_flag,
    },
    null,
    2
  )
);

console.log("\n=== JSON rows ===");
console.log(
  JSON.stringify(
    rows.map((r) => ({
      year: r.year,
      demand_twh: round(r.demand_twh, 2),
      solar_gw: round(r.solar_gw, 2),
      wind_gw: round(r.wind_gw, 2),
      ttf_eur_mwh: round(r.ttf_eur_mwh, 2),
      avg_price_eur_mwh: round(r.avg_price_eur_mwh, 2),
      gas_margin_eur_per_mw: round(r.gas_margin_eur_per_mw, 0),
      capacity_extrapolated_past_2040: r.extrapolated_past_2040,
    })),
    null,
    2
  )
);
