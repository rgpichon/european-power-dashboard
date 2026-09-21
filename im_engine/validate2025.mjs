#!/usr/bin/env node
/**
 * 2025 historical reproduction.
 * Season-specific TTF → SRMC; EUA annual; wind MVF discount; solar discount=0; visibility.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  loadDataFromDir,
  runScenario,
  compareToHistorical,
} from "./scenarioEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "im_data");

const data = loadDataFromDir(DATA, readFileSync);
const hist2025 = data.historical.years.find((y) => y.year === 2025);
const seas = data.seasonalCommodities.by_year["2025"];

const result = runScenario(data, {
  year: 2025,
  demandGrowthScenario: "B",
  solarCapacityGW: hist2025.capacity_gw_ember.solar,
  windCapacityGW: hist2025.capacity_gw_ember.wind,
  windYearType: "base",
  supplyScenario: "base_case",
  // No flat TTF override — engine loads 2025 season means from seasonal_commodity_means.json
  euaOverride: seas.eua_annual_eur_per_t,
});

const cmp = compareToHistorical(result, hist2025);
const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

console.log(
  JSON.stringify(
    {
      validation:
        "2025 reproduction — seasonal TTF SRMC + visibility + wind MVF discount",
      commodities: {
        ttf_by_season: result.commodities.ttf_by_season,
        ttf_annual_equal_weight: round(result.commodities.ttf_eur_mwh, 2),
        eua_annual: round(result.commodities.eua_eur_per_t, 2),
        srmc_by_season: Object.fromEntries(
          Object.entries(result.commodities.srmc_by_season).map(([k, v]) => [
            k,
            round(v, 2),
          ])
        ),
        srmc_annual_equal_weight: round(result.commodities.srmc_eur_mwh, 2),
        ttf_source: result.commodities.ttf_source,
        eua_treatment: result.commodities.eua_treatment,
      },
      capacity: {
        nameplate_gw: result.annual.nameplate_capacity_gw,
        grid_visible_gw: {
          solar: round(result.annual.grid_visible_capacity_gw.solar, 2),
          wind: round(result.annual.grid_visible_capacity_gw.wind, 2),
        },
        visibility_factors: {
          solar: result.methodology.grid_visibility.solar_visibility_factor,
          wind: result.methodology.grid_visibility.wind_visibility_factor,
        },
        generation_twh: {
          solar: round(result.annual.solar_generation_mwh / 1e6, 2),
          wind: round(result.annual.wind_generation_mwh / 1e6, 2),
          vre: round(result.annual.vre_generation_mwh / 1e6, 2),
        },
      },
      methodology: result.methodology,
      comparison: {
        avg_price_eur_mwh: {
          model: round(cmp.avg_price_eur_mwh.model, 2),
          actual: round(cmp.avg_price_eur_mwh.actual, 2),
          abs_eur: round(cmp.avg_price_eur_mwh.abs, 2),
          pct: round(cmp.avg_price_eur_mwh.pct, 1),
        },
        vre_share: {
          model_of_demand: round(cmp.vre_share.model_of_demand, 4),
          actual_of_generation: round(cmp.vre_share.actual_of_generation, 4),
          note: cmp.vre_share.note,
        },
        solar_mvf: {
          model: round(result.annual.solar_mvf, 4),
          actual: hist2025.mvf.solar,
          abs: round(result.annual.solar_mvf - hist2025.mvf.solar, 4),
        },
        wind_mvf: {
          model: round(result.annual.wind_mvf, 4),
          actual: hist2025.mvf.wind,
          abs: round(result.annual.wind_mvf - hist2025.mvf.wind, 4),
        },
      },
      cells: result.cells.map((c) => ({
        season: c.season,
        block: c.block,
        vre_bin_left: c.vre_bin_left,
        ttf: round(c.ttf_eur_mwh, 2),
        srmc: round(c.srmc_eur_mwh, 2),
        price: round(c.price_eur_mwh, 2),
        vre_share: round(c.vre_share, 3),
      })),
    },
    null,
    2
  )
);
