/**
 * Interaction Model — client-side scenario engine (v1).
 *
 * Pure functions over the static JSON bundle in Dashboard/im_data/.
 * No backend. Mirrors Pricing mechanism v1 §5–6 + renewables scenario formula.
 *
 * Browser:  import { runScenario, loadDataFromUrls } from './scenarioEngine.js'
 * Node:     import { runScenario } from './scenarioEngine.js'  (+ pass preloaded data)
 */

/** @typedef {'A'|'B'|'C'} DemandGrowthScenario */
/** @typedef {'low'|'base'|'high'} WindYearType */
/** @typedef {'base_case'} SupplyScenario */

/**
 * @typedef {object} ScenarioInputs
 * @property {number} year  2025–2045
 * @property {DemandGrowthScenario} demandGrowthScenario
 * @property {number} solarCapacityGW
 * @property {number} windCapacityGW
 * @property {WindYearType} windYearType
 * @property {SupplyScenario} [supplyScenario]
 * @property {number | Record<'DJF'|'MAM'|'JJA'|'SON', number>} [ttfOverride]
 *   optional diagnostic override (€/MWh) — flat number or per-season map
 * @property {number} [euaOverride]  optional diagnostic override (€/t, annual)
 * @property {boolean} [useSeasonalTtf]
 *   if true (default when seasonalCommodityMeans present and year has data),
 *   use season-specific TTF means for SRMC; EUA stays annual
 * @property {number} [ttfInflationRate]
 *   annual inflation for nominal TTF beyond the forward curve (default from
 *   ttf_forward_curve.json beyond_curve.inflation_rate, else 0.02). Adjustable.
 * @property {number} [ttfAdjustmentPct]
 *   user shock overlay applied after base TTF resolution, as percent
 *   (e.g. 10 → ×1.10). Default 0. Does not alter the beyond-curve base path.
 * @property {object} [capacityPathMeta]
 *   optional methodology note from the multi-year chain (e.g. post-2040 extrapolation)
 */

const SOLAR_ANCHOR_KWH_PER_KWP = 1000;
const WIND_ANCHOR_FLH = 2000;
const WIND_MULT = { low: 0.95, base: 1.0, high: 1.05 };

/**
 * @param {object} data  preloaded JSON bundle
 * @param {ScenarioInputs} inputs
 */
export function runScenario(data, inputs) {
  validateInputs(inputs);

  const {
    year,
    demandGrowthScenario,
    solarCapacityGW,
    windCapacityGW,
    windYearType,
    supplyScenario = "base_case",
  } = inputs;

  if (supplyScenario !== "base_case") {
    throw new Error(
      `supplyScenario "${supplyScenario}" is not parameterized yet; only "base_case" is valid`
    );
  }

  const growth = data.demandGrowth.scenarios.find(
    (s) => s.id === demandGrowthScenario
  );
  if (!growth) {
    throw new Error(`Unknown demandGrowthScenario: ${demandGrowthScenario}`);
  }

  const baseYear = data.demandGrowth.base_year;
  const baseTwh = data.demandGrowth.demand_base_twh;
  const pivotYear = data.demandGrowth.segment_pivot_year ?? 2037;
  const g1 = growth.growth_rate;
  const g2 =
    growth.growth_rate_post_2037 != null ? growth.growth_rate_post_2037 : g1;
  const demandYearTwh = projectDemandTwh(baseTwh, baseYear, pivotYear, g1, g2, year);
  const demandYearMwh = demandYearTwh * 1e6;
  const demandSegment =
    year <= pivotYear ? "segment_1_to_pivot" : "segment_2_post_pivot";

  const windMult = WIND_MULT[windYearType];
  if (windMult == null) {
    throw new Error(`Unknown windYearType: ${windYearType}`);
  }

  // Annual tech energy (MWh): nameplate GW → grid-visible → MW → × yield
  // User input stays nameplate; visibility applied internally only.
  const visSolar = data.visibility?.solar_visibility_factor ?? 1;
  const visWind = data.visibility?.wind_visibility_factor ?? 1;
  const solarAnnualMwh =
    solarCapacityGW * visSolar * 1000 * SOLAR_ANCHOR_KWH_PER_KWP;
  const windAnnualMwh =
    windCapacityGW * visWind * 1000 * WIND_ANCHOR_FLH * windMult;

  const eua = resolveEuaAnnual(data, year, inputs);
  const era = data.gasSrmc.scenario_default_era;
  const ttfBySeason = resolveTtfBySeason(data, year, inputs);
  const ttfAdjPct = Number(inputs.ttfAdjustmentPct ?? 0);
  for (const s of Object.keys(ttfBySeason)) {
    ttfBySeason[s] = applyTtfAdjustmentPct(ttfBySeason[s], ttfAdjPct);
  }
  // Demand-weighted annual TTF/SRMC for summary reporting only
  const ttfAnnual =
    typeof inputs.ttfOverride === "number"
      ? applyTtfAdjustmentPct(inputs.ttfOverride, ttfAdjPct)
      : Object.values(ttfBySeason).reduce((a, b) => a + b, 0) / 4;
  const srmcAnnual =
    ttfAnnual / era.efficiency + eua * era.eua_multiplier_t_per_mwh_e;

  const solarByKey = indexCells(data.solar.cells, "share");
  const windByKey = indexCells(data.wind.cells, "share");
  const demandByKey = indexDemand(data.demand.cells);

  const deltaByBin = indexBins(data.delta.bins, "delta_eur_mwh");
  const pNegByBin = indexBins(data.pNeg.bins, "p_neg_eur_mwh");
  const bucketByBin = indexBuckets(data.buckets.bins);
  const discounts = indexDiscounts(data.mvfDiscounts);

  const cells = [];
  for (const season of ["DJF", "MAM", "JJA", "SON"]) {
    const ttf = ttfBySeason[season];
    const srmc =
      ttf / era.efficiency + eua * era.eua_multiplier_t_per_mwh_e;

    for (const block of ["night", "morning", "afternoon", "evening"]) {
      const key = `${season}|${block}`;
      const solarShare = solarByKey.get(key);
      const windShare = windByKey.get(key);
      const loadShare = demandByKey.get(key);
      if (solarShare == null || windShare == null || loadShare == null) {
        throw new Error(`Missing shape for ${key}`);
      }

      const demandEnergyMwh = demandYearMwh * loadShare;
      const solarEnergyMwh = solarAnnualMwh * solarShare;
      const windEnergyMwh = windAnnualMwh * windShare;
      const vreGenMwh = solarEnergyMwh + windEnergyMwh;
      const vreShare =
        demandEnergyMwh > 0 ? vreGenMwh / demandEnergyMwh : 0;

      const binLeft = vreBinLeft(vreShare);
      const delta = deltaByBin.get(binLeft);
      const pNegRow = pNegByBin.get(binLeft);
      const bucket = bucketByBin.get(binLeft);
      if (delta == null || pNegRow == null || bucket == null) {
        throw new Error(`Missing calibration for bin ${binLeft}`);
      }

      const pNeg = pNegRow.value; // already 0 when flagged insufficient
      const sGas = bucket.s_gas;
      const sNeg = bucket.s_neg;
      const sRes = Math.max(0, 1 - sGas - sNeg);

      // Module 3 cell price — untouched by within-cell MVF discounts
      const price =
        sGas * srmc + sNeg * pNeg + sRes * (srmc + delta);

      const disc = discounts.get(key) || {
        wind_discount_eur_mwh: 0,
        solar_discount_eur_mwh: 0,
      };

      cells.push({
        season,
        block,
        load_energy_share: loadShare,
        demand_energy_mwh: demandEnergyMwh,
        solar_share: solarShare,
        wind_share: windShare,
        solar_energy_mwh: solarEnergyMwh,
        wind_energy_mwh: windEnergyMwh,
        vre_share: vreShare,
        vre_bin_left: binLeft,
        s_gas: sGas,
        s_neg: sNeg,
        s_res: sRes,
        delta_eur_mwh: delta,
        p_neg_eur_mwh: pNeg,
        p_neg_flag: pNegRow.flag,
        ttf_eur_mwh: ttf,
        srmc_eur_mwh: srmc,
        price_eur_mwh: price,
        wind_discount_eur_mwh: disc.wind_discount_eur_mwh,
        solar_discount_eur_mwh: disc.solar_discount_eur_mwh,
        // Capture prices for MVF only (cell price + empirical within-cell discount)
        wind_capture_price_eur_mwh: price + disc.wind_discount_eur_mwh,
        solar_capture_price_eur_mwh: price + disc.solar_discount_eur_mwh,
      });
    }
  }

  const sumDemand = sum(cells, (c) => c.demand_energy_mwh);
  const sumSolar = sum(cells, (c) => c.solar_energy_mwh);
  const sumWind = sum(cells, (c) => c.wind_energy_mwh);
  const sumVre = sumSolar + sumWind;

  const avgPrice =
    sumDemand > 0
      ? sum(cells, (c) => c.price_eur_mwh * c.demand_energy_mwh) / sumDemand
      : NaN;

  // MVF uses discounted capture prices; annual avg price does NOT
  const solarCapture =
    sumSolar > 0
      ? sum(cells, (c) => c.solar_capture_price_eur_mwh * c.solar_energy_mwh) /
        sumSolar
      : NaN;
  const windCapture =
    sumWind > 0
      ? sum(cells, (c) => c.wind_capture_price_eur_mwh * c.wind_energy_mwh) /
        sumWind
      : NaN;

  // Uncorrected captures retained for diagnostics
  const solarCaptureRaw =
    sumSolar > 0
      ? sum(cells, (c) => c.price_eur_mwh * c.solar_energy_mwh) / sumSolar
      : NaN;
  const windCaptureRaw =
    sumWind > 0
      ? sum(cells, (c) => c.price_eur_mwh * c.wind_energy_mwh) / sumWind
      : NaN;

  const vreShareOfDemand = sumDemand > 0 ? sumVre / sumDemand : NaN;

  const gasDispatch = computeGasDispatch(cells, year, data.gasDispatchOverlay);

  return {
    inputs: {
      year,
      demandGrowthScenario,
      solarCapacityGW,
      windCapacityGW,
      windYearType,
      supplyScenario,
      windMultiplier: windMult,
    },
    commodities: {
      ttf_eur_mwh: ttfAnnual,
      ttf_by_season: ttfBySeason,
      eua_eur_per_t: eua,
      eua_treatment: "annual",
      eua_source: euaSourceLabel(data, year, inputs),
      eua_beyond_curve: beyondEuaCurveMeta(data, year, inputs),
      srmc_eur_mwh: srmcAnnual,
      srmc_by_season: Object.fromEntries(
        ["DJF", "MAM", "JJA", "SON"].map((s) => [
          s,
          ttfBySeason[s] / era.efficiency +
            eua * era.eua_multiplier_t_per_mwh_e,
        ])
      ),
      efficiency: era.efficiency,
      eua_multiplier: era.eua_multiplier_t_per_mwh_e,
      ttf_source: ttfSourceLabel(data, year, inputs),
      ttf_adjustment_pct: ttfAdjPct,
      ttf_seasonality:
        "Season-specific TTF means drive per-cell SRMC when historical season means exist; " +
        "forward-curve years still use annual mean flat across seasons; " +
        "beyond last curve year: real-flat at Dec-2030 anchor × (1+inflation)^(year−2030).",
      ttf_beyond_curve: beyondCurveMeta(data, year, inputs),
    },
    demand: {
      base_year: baseYear,
      demand_base_twh: baseTwh,
      growth_rate: g1,
      growth_rate_post_2037: g2,
      segment_pivot_year: pivotYear,
      demand_segment: demandSegment,
      demand_year_twh: demandYearTwh,
      demand_year_mwh: demandYearMwh,
    },
    methodology: {
      grid_visibility: {
        solar_visibility_factor: visSolar,
        wind_visibility_factor: visWind,
        applied_internally: true,
        user_capacity_is_nameplate: true,
        note:
          data.visibility?.meta?.solar?.interpretation ??
          "nameplate × visibility × yield × shape",
        wind_note:
          data.visibility?.meta?.wind?.interpretation ?? null,
      },
      within_cell_mvf_discounts: {
        applied: true,
        wind_discount_applied: true,
        solar_discount_applied: false,
        held_fixed_from_historical: true,
        scenario_dependent: false,
        v1_simplification:
          "Wind MVF uses empirical within-cell discounts locked from clean-year hours. " +
          "Solar within-cell discount is zeroed (bin-assignment already captures solar cannibalization; " +
          "absolute € discount double-counted). Core Module 3 prices and avg price unadjusted.",
        clean_years: data.mvfDiscounts?.meta?.clean_years ?? null,
        within_cell_corr_wind_price:
          data.mvfDiscounts?.meta?.within_cell_corr_wind_price_mean ?? null,
        within_cell_corr_solar_price:
          data.mvfDiscounts?.meta?.within_cell_corr_solar_price_mean ?? null,
      },
      gas_dispatch_overlay: gasDispatch.methodology,
      capacity_path: inputs.capacityPathMeta
        ? {
            ...inputs.capacityPathMeta,
            applied: true,
            note:
              inputs.capacityPathMeta.post_2040?.rationale ??
              inputs.capacityPathMeta.rationale ??
              null,
            flag:
              inputs.capacityPathMeta.year_extrapolated_past_2040
                ? inputs.capacityPathMeta.post_2040?.flag ??
                  "extrapolation_past_last_stated_target_year"
                : inputs.capacityPathMeta.year_extrapolated_past_2040 === false
                  ? "within_stated_target_path"
                  : inputs.capacityPathMeta.post_2040?.flag ?? null,
          }
        : { applied: false },
    },
    gas_dispatch: gasDispatch.summary,
    annual: {
      solar_generation_mwh: sumSolar,
      wind_generation_mwh: sumWind,
      vre_generation_mwh: sumVre,
      demand_mwh: sumDemand,
      vre_share_of_demand: vreShareOfDemand,
      avg_price_eur_mwh: avgPrice,
      solar_capture_eur_mwh: solarCapture,
      wind_capture_eur_mwh: windCapture,
      solar_mvf: avgPrice > 0 ? solarCapture / avgPrice : NaN,
      wind_mvf: avgPrice > 0 ? windCapture / avgPrice : NaN,
      solar_mvf_uncorrected:
        avgPrice > 0 ? solarCaptureRaw / avgPrice : NaN,
      wind_mvf_uncorrected: avgPrice > 0 ? windCaptureRaw / avgPrice : NaN,
      nameplate_capacity_gw: {
        solar: solarCapacityGW,
        wind: windCapacityGW,
      },
      grid_visible_capacity_gw: {
        solar: solarCapacityGW * visSolar,
        wind: windCapacityGW * visWind,
      },
    },
    cells,
  };
}

/**
 * Calendar hours in one 6h block for a meteorological season within a calendar year.
 * Season months match commodity / shape convention (DJF = Dec+Jan+Feb of that year).
 */
export function hoursPerSeasonBlock(year, season) {
  const months = {
    DJF: [12, 1, 2],
    MAM: [3, 4, 5],
    JJA: [6, 7, 8],
    SON: [9, 10, 11],
  }[season];
  if (!months) throw new Error(`Unknown season ${season}`);
  let days = 0;
  for (const m of months) {
    days += new Date(Date.UTC(year, m, 0)).getUTCDate();
  }
  return days * 6;
}

/**
 * Hour-weighted annual state shares + volume-weighted state prices from a
 * scenario run. Residual cell price is derived as SRMC+δ (not a cell field).
 * avg_price_eur_mwh is the engine's demand-energy-weighted blended annual
 * average — a different quantity from the hour-weighted S_* shares.
 *
 * @param {object} data  loaded im_data bundle
 * @param {ScenarioInputs} inputs
 * @returns {{
 *   S_gas: number, S_neg: number, S_res: number,
 *   P_gas: number|null, P_neg: number|null, P_res: number|null,
 *   avg_price_eur_mwh: number,
 *   scenarioResult: object
 * }}
 */
export function computeAnnualStateAggregate(data, inputs) {
  const scenarioResult = runScenario(data, inputs);
  const year = inputs.year;
  const cells = scenarioResult.cells;

  let H = 0;
  let wGas = 0;
  let wNeg = 0;
  let wRes = 0;
  let sumGasPx = 0;
  let sumNegPx = 0;
  let sumResPx = 0;

  for (const c of cells) {
    const h = hoursPerSeasonBlock(year, c.season);
    const pRes = c.srmc_eur_mwh + c.delta_eur_mwh;
    H += h;
    wGas += h * c.s_gas;
    wNeg += h * c.s_neg;
    wRes += h * c.s_res;
    sumGasPx += h * c.s_gas * c.srmc_eur_mwh;
    sumNegPx += h * c.s_neg * c.p_neg_eur_mwh;
    sumResPx += h * c.s_res * pRes;
  }

  const safeDiv = (num, den) => (den > 1e-12 ? num / den : null);

  return {
    S_gas: H > 0 ? wGas / H : 0,
    S_neg: H > 0 ? wNeg / H : 0,
    S_res: H > 0 ? wRes / H : 0,
    P_gas: safeDiv(sumGasPx, wGas),
    P_neg: safeDiv(sumNegPx, wNeg),
    P_res: safeDiv(sumResPx, wRes),
    avg_price_eur_mwh: scenarioResult.annual.avg_price_eur_mwh,
    scenarioResult,
  };
}

/**
 * Mechanical gas-dispatch rule from Module 3 cell plugs, plus empirical overlay.
 *
 * Raw (per cell, then season-aggregated):
 *   dispatch_share = s_gas + s_res·1{δ≥0}
 *   spread_raw = (s_res·δ)/dispatch_share if δ≥0 else 0
 *
 * Overlay (global constants locked from clean years — NOT applied to prices/δ/shares):
 *   hours_corr = hours_raw × hours_mult
 *   spread_corr = spread_raw × spread_mult
 *   margin = hours_corr × spread_corr   (€ per MW)
 *
 * Works for any scenario year (uses that year's calendar for cell hours).
 */
export function computeGasDispatch(cells, year, overlayJson) {
  const ov = overlayJson?.overlay ?? {};
  const hoursMult = ov.hours_mult ?? 1;
  const spreadMult = ov.spread_mult ?? 1;

  const bySeason = {};
  for (const s of ["DJF", "MAM", "JJA", "SON"]) {
    bySeason[s] = { hours_raw: 0, margin_raw: 0, cells: [] };
  }

  for (const c of cells) {
    const n = hoursPerSeasonBlock(year, c.season);
    const sGas = c.s_gas;
    const sRes = c.s_res;
    const dlt = c.delta_eur_mwh;
    let dispShare;
    let hoursRaw;
    let marginRaw;
    if (dlt >= 0) {
      dispShare = sGas + sRes;
      hoursRaw = n * dispShare;
      marginRaw = n * sRes * dlt;
    } else {
      dispShare = sGas;
      hoursRaw = n * dispShare;
      marginRaw = 0;
    }
    const spreadRaw = hoursRaw > 0 ? marginRaw / hoursRaw : 0;
    bySeason[c.season].hours_raw += hoursRaw;
    bySeason[c.season].margin_raw += marginRaw;
    bySeason[c.season].cells.push({
      block: c.block,
      vre_bin_left: c.vre_bin_left,
      hours_in_block: n,
      dispatch_share_raw: dispShare,
      dispatch_hours_raw: hoursRaw,
      spread_raw: spreadRaw,
      margin_raw: marginRaw,
    });
  }

  const seasons = [];
  for (const s of ["DJF", "MAM", "JJA", "SON"]) {
    const raw = bySeason[s];
    const hoursRaw = raw.hours_raw;
    const spreadRaw = hoursRaw > 0 ? raw.margin_raw / hoursRaw : 0;
    const hours = hoursRaw * hoursMult;
    const spread = spreadRaw * spreadMult;
    const margin = hours * spread;
    seasons.push({
      season: s,
      dispatch_hours_raw: hoursRaw,
      avg_spread_raw_eur_mwh: spreadRaw,
      gross_margin_raw_eur_per_mw: raw.margin_raw,
      dispatch_hours: hours,
      avg_spread_eur_mwh: spread,
      gross_margin_eur_per_mw: margin,
    });
  }

  const hoursAnn = sum(seasons, (r) => r.dispatch_hours);
  const marginAnn = sum(seasons, (r) => r.gross_margin_eur_per_mw);
  const annual = {
    season: "ANNUAL",
    dispatch_hours: hoursAnn,
    avg_spread_eur_mwh: hoursAnn > 0 ? marginAnn / hoursAnn : 0,
    gross_margin_eur_per_mw: marginAnn,
  };

  return {
    summary: {
      by_season: seasons,
      annual,
      overlay: {
        hours_mult: hoursMult,
        spread_mult: spreadMult,
        season_specific: false,
      },
    },
    methodology: {
      applied: true,
      v1_simplification: true,
      held_fixed_from_historical: true,
      scenario_dependent: false,
      applies_to:
        "gas dispatch hours, average spread, gross margin only — never Module 3 price, s_gas/s_neg/s_res, or δ",
      mechanical_rule:
        overlayJson?.meta?.mechanical_rule ??
        "dispatch_share = s_gas + s_res·1{δ≥0}; spread_raw = (s_res·δ)/share if δ≥0 else 0",
      overlay_choice: overlayJson?.meta?.chosen ?? "two_global_constants",
      hours_mult: hoursMult,
      spread_mult: spreadMult,
      clean_years: overlayJson?.meta?.held_fixed_from_clean_years ?? null,
      rejected_alternatives: overlayJson?.meta?.rejected_alternatives ?? null,
      same_disclosure_standard_as:
        overlayJson?.meta?.same_disclosure_standard_as ??
        "within_cell_mvf_discounts (wind)",
      note:
        "Empirical overlay locked from four clean years. Thinner than four season-specific pairs: " +
        "δ/SRMC formulas looked strong in-sample but unstable on leave-one-out (n=4); " +
        "global constants already pass validation thresholds.",
    },
  };
}

/**
 * Resolve TTF by season for SRMC.
 *
 * Priority:
 * 1. ttfOverride as {DJF,MAM,JJA,SON} map
 * 2. ttfOverride as flat number → same for all seasons
 * 3. Historical year with seasonalCommodityMeans → that year's season means
 * 4. Forward curve year → annual mean of months (seasonal split deferred)
 * 5. Beyond last curve year → real-flat Dec-2030 anchor × (1+inflation)^(year−2030)
 * 6. Locked spot (only if no beyond_curve config and no curve)
 *
 * EUA is always annual (see resolveEuaAnnual).
 * ttfAdjustmentPct is applied in runScenario after this resolution.
 */
/** Same multiplier applied to resolved TTF values in runScenario. */
export function applyTtfAdjustmentPct(value, adjustmentPct) {
  return value * (1 + Number(adjustmentPct ?? 0) / 100);
}

/**
 * Monthly forward-curve points plus nominal beyond-curve annual anchors (2031+).
 * `base` is the locked curve; `adjusted` applies inputs.ttfAdjustmentPct via applyTtfAdjustmentPct.
 */
export function resolveTtfForwardCurveSeries(data, inputs = {}) {
  const labels = [];
  const base = [];
  for (const p of data.ttf?.curve ?? []) {
    labels.push(p.month);
    base.push(p.ttf_eur_mwh);
  }
  const { lastYear, real, inflation } = beyondCurveConfig(data, inputs);
  if (real != null) {
    for (let y = lastYear + 1; y <= 2045; y++) {
      labels.push(String(y));
      base.push(real * Math.pow(1 + inflation, y - lastYear));
    }
  }
  const pct = inputs.ttfAdjustmentPct ?? 0;
  const adjusted = base.map((v) => applyTtfAdjustmentPct(v, pct));
  return { labels, base, adjusted };
}

function resolveTtfBySeason(data, year, inputs) {
  const override = inputs.ttfOverride;
  if (override != null && typeof override === "object") {
    for (const s of ["DJF", "MAM", "JJA", "SON"]) {
      if (!(s in override) || !Number.isFinite(override[s])) {
        throw new Error(`ttfOverride map missing finite ${s}`);
      }
    }
    return { ...override };
  }
  if (typeof override === "number") {
    return { DJF: override, MAM: override, JJA: override, SON: override };
  }

  // Explicit opt-out of seasonal TTF (diagnostic)
  if (inputs.useSeasonalTtf === false) {
    const flat = resolveTtfAnnual(data, year, inputs);
    return { DJF: flat, MAM: flat, JJA: flat, SON: flat };
  }

  const hist = data.seasonalCommodities?.by_year?.[String(year)];
  if (hist?.ttf_by_season) {
    const out = {};
    for (const s of ["DJF", "MAM", "JJA", "SON"]) {
      out[s] = hist.ttf_by_season[s].ttf_eur_mwh;
    }
    return out;
  }

  const flat = resolveTtfAnnual(data, year, inputs);
  return { DJF: flat, MAM: flat, JJA: flat, SON: flat };
}

function beyondCurveConfig(data, inputs) {
  const bc = data.ttf?.beyond_curve ?? {};
  const lastYear = bc.last_curve_year ?? 2030;
  const real =
    bc.real_ttf_eur_mwh ??
    data.ttf.curve.find((p) => p.month === (bc.real_anchor_month || "2030-12"))
      ?.ttf_eur_mwh ??
    null;
  const inflation =
    inputs.ttfInflationRate != null
      ? Number(inputs.ttfInflationRate)
      : bc.inflation_rate != null
        ? Number(bc.inflation_rate)
        : 0.02;
  return { lastYear, real, inflation, bc };
}

/**
 * Annual TTF for a scenario year.
 * On-curve → mean of that year's monthly points.
 * Beyond curve → real_anchor × (1+inflation)^(year − last_curve_year).
 */
function resolveTtfAnnual(data, year, inputs = {}) {
  const months = data.ttf.curve.filter((p) => p.month.startsWith(String(year)));
  if (months.length > 0) {
    return months.reduce((a, p) => a + p.ttf_eur_mwh, 0) / months.length;
  }
  const { lastYear, real, inflation } = beyondCurveConfig(data, inputs);
  if (real != null && year > lastYear) {
    return real * Math.pow(1 + inflation, year - lastYear);
  }
  return data.ttf.spot.ttf_eur_mwh;
}

function beyondCurveMeta(data, year, inputs) {
  const { lastYear, real, inflation, bc } = beyondCurveConfig(data, inputs);
  const onCurve = data.ttf.curve.some((p) => p.month.startsWith(String(year)));
  const beyond = !onCurve && year > lastYear;
  return {
    applied: beyond,
    last_curve_year: lastYear,
    real_anchor_month: bc.real_anchor_month ?? "2030-12",
    real_ttf_eur_mwh: real,
    inflation_rate: inflation,
    inflation_rate_adjustable: true,
    formula: beyond
      ? `${real} × (1+${inflation})^(${year}-${lastYear})`
      : null,
    summer_floor_adjacent_eur_mwh: bc.summer_floor_adjacent_eur_mwh ?? 20.6,
    note: bc.note ?? null,
  };
}

function beyondEuaCurveConfig(data, inputs = {}) {
  const bc = data.eua?.beyond_curve ?? {};
  const lastYear = bc.last_curve_year ?? 2032;
  const onCurvePt = (data.eua?.curve ?? []).find((p) => p.year === lastYear);
  const real = bc.real_eua_eur_per_t ?? onCurvePt?.eua_eur_per_t ?? null;
  if (real == null) {
    throw new Error(
      "eua_forward_curve.json beyond_curve.real_eua_eur_per_t (or Dec last-year point) required"
    );
  }
  const inflation =
    inputs.euaInflationRate != null
      ? Number(inputs.euaInflationRate)
      : bc.inflation_rate != null
        ? Number(bc.inflation_rate)
        : data.ttf?.beyond_curve?.inflation_rate != null
          ? Number(data.ttf.beyond_curve.inflation_rate)
          : 0.02;
  return { lastYear, real, inflation, bc };
}

/**
 * Annual EUA for a scenario year — locked ICE Dec forward curve (same role as TTF).
 * Priority:
 * 1. euaOverride (diagnostic only)
 * 2. Historical year in seasonal_commodity_means
 * 3. On-curve Dec-Y settlement (eua_forward_curve.json)
 * 4. Beyond last curve year → real Dec anchor × (1+inflation)^(year−last)
 * No scalar eua_reference fallback — missing curve is a hard error.
 */
function resolveEuaAnnual(data, year, inputs = {}) {
  if (inputs.euaOverride != null) return Number(inputs.euaOverride);
  const hist = data.seasonalCommodities?.by_year?.[String(year)];
  if (hist?.eua_annual_eur_per_t != null) {
    return hist.eua_annual_eur_per_t;
  }
  const curve = data.eua?.curve;
  if (!Array.isArray(curve) || curve.length === 0) {
    throw new Error(
      "eua_forward_curve.json is required (locked ICE Dec EUA path); scalar eua_reference is retired"
    );
  }
  const pt = curve.find((p) => p.year === year);
  if (pt?.eua_eur_per_t != null) return pt.eua_eur_per_t;
  const { lastYear, real, inflation } = beyondEuaCurveConfig(data, inputs);
  if (year > lastYear) {
    const raw = real * Math.pow(1 + inflation, year - lastYear);
    // 10 dp — within Excel/OOXML numeric serialization so IM ↔ workbook recon is exact
    return Math.round(raw * 1e10) / 1e10;
  }
  throw new Error(
    `No EUA for year ${year}: not on eua_forward_curve and not beyond last_curve_year=${lastYear}`
  );
}

function euaSourceLabel(data, year, inputs = {}) {
  if (inputs.euaOverride != null) return "override";
  if (
    data.seasonalCommodities?.by_year?.[String(year)]?.eua_annual_eur_per_t !=
    null
  ) {
    return `historical_annual_eua_${year}`;
  }
  const pt = (data.eua?.curve ?? []).find((p) => p.year === year);
  if (pt?.eua_eur_per_t != null) {
    return `forward_curve_dec_${year}_${pt.liquidity || "quoted"}`;
  }
  const { lastYear, real, inflation } = beyondEuaCurveConfig(data, inputs);
  if (year > lastYear) {
    return `beyond_curve_real_flat_nominal_inflate_${lastYear}_i=${inflation}`;
  }
  return "eua_curve_missing_year";
}

function beyondEuaCurveMeta(data, year, inputs = {}) {
  const { lastYear, real, inflation, bc } = beyondEuaCurveConfig(data, inputs);
  const onCurve = (data.eua?.curve ?? []).some((p) => p.year === year);
  const beyond = !onCurve && year > lastYear;
  return {
    applied: beyond,
    last_curve_year: lastYear,
    real_anchor_month: bc.real_anchor_month ?? "2032-12",
    real_eua_eur_per_t: real,
    inflation_rate: inflation,
    formula: beyond
      ? `${real} × (1+${inflation})^(${year}-${lastYear})`
      : null,
    note: bc.note ?? null,
  };
}

function ttfSourceLabel(data, year, inputs) {
  if (inputs.ttfOverride != null) {
    return typeof inputs.ttfOverride === "object"
      ? "override_seasonal"
      : "override_flat";
  }
  if (
    inputs.useSeasonalTtf !== false &&
    data.seasonalCommodities?.by_year?.[String(year)]?.ttf_by_season
  ) {
    return `historical_seasonal_ttf_${year}`;
  }
  const months = data.ttf.curve.filter((p) => p.month.startsWith(String(year)));
  if (months.length > 0) {
    return `forward_curve_annual_mean_${year}_flat_across_seasons`;
  }
  const { lastYear, real, inflation } = beyondCurveConfig(data, inputs);
  if (real != null && year > lastYear) {
    return `beyond_curve_real_flat_nominal_inflate_${lastYear}_i=${inflation}`;
  }
  return "spot_locked_flat";
}

/**
 * Two-segment demand projection.
 * Through pivotYear: base × (1+g1)^(y−baseYear)
 * After pivot: demand_pivot × (1+g2)^(y−pivotYear)
 */
export function projectDemandTwh(baseTwh, baseYear, pivotYear, g1, g2, year) {
  if (year <= pivotYear) {
    return baseTwh * Math.pow(1 + g1, year - baseYear);
  }
  const atPivot = baseTwh * Math.pow(1 + g1, pivotYear - baseYear);
  return atPivot * Math.pow(1 + g2, year - pivotYear);
}

/** Floor VRE share into 10pp bin left edge; cap at 90. */
export function vreBinLeft(vreShare) {
  if (!Number.isFinite(vreShare) || vreShare < 0) return 0;
  const pct = vreShare * 100;
  const left = Math.floor(pct / 10) * 10;
  return Math.min(90, Math.max(0, left));
}

/** EEG / Ember capacity path used by runMultiYear (2025→2030→2040 rate →2045). */
export const EEG_CAPACITY_TARGETS = {
  2030: { solar: 215, wind: 115 },
  2040: { solar: 400, wind: 160 },
};

export const EEG_CAPACITY_RATE = {
  solarPerYear:
    (EEG_CAPACITY_TARGETS[2040].solar - EEG_CAPACITY_TARGETS[2030].solar) /
    (2040 - 2030),
  windPerYear:
    (EEG_CAPACITY_TARGETS[2040].wind - EEG_CAPACITY_TARGETS[2030].wind) /
    (2040 - 2030),
};

function lerp(a, b, t) {
  return a + t * (b - a);
}

/**
 * Nameplate GW on the locked EEG buildout path.
 * @param {number} year
 * @param {{ solar: number, wind: number }} caps2025  Ember 2025 nameplate
 */
export function eegCapacityAt(year, caps2025) {
  if (year <= 2025) {
    return { solar: caps2025.solar, wind: caps2025.wind, extrapolated_past_2040: false };
  }
  if (year <= 2030) {
    const t = (year - 2025) / (2030 - 2025);
    return {
      solar: lerp(caps2025.solar, EEG_CAPACITY_TARGETS[2030].solar, t),
      wind: lerp(caps2025.wind, EEG_CAPACITY_TARGETS[2030].wind, t),
      extrapolated_past_2040: false,
    };
  }
  const yearsPast2030 = year - 2030;
  return {
    solar: EEG_CAPACITY_TARGETS[2030].solar + yearsPast2030 * EEG_CAPACITY_RATE.solarPerYear,
    wind: EEG_CAPACITY_TARGETS[2030].wind + yearsPast2030 * EEG_CAPACITY_RATE.windPerYear,
    extrapolated_past_2040: year > 2040,
  };
}

export function emberCaps2025(data) {
  const hist = data.historical?.years?.find((y) => y.year === 2025);
  if (!hist?.capacity_gw_ember) {
    throw new Error("historical_reference_years.json missing 2025 Ember capacities");
  }
  return {
    solar: hist.capacity_gw_ember.solar,
    wind: hist.capacity_gw_ember.wind,
  };
}

/** Equal-weight seasonal mean TTF before adjustment (same resolution as runScenario). */
export function resolveBaseTtfAnnual(data, year, inputs = {}) {
  const bySeason = resolveTtfBySeason(data, year, { ...inputs, ttfAdjustmentPct: 0 });
  return Object.values(bySeason).reduce((a, b) => a + b, 0) / 4;
}

/**
 * Annual TTF path 2025–2045: locked base vs scenario adjustment.
 * Uses the same resolve + applyTtfAdjustmentPct path as runScenario.
 */
export function buildTtfAnnualPath(data, inputs, yearStart = 2025, yearEnd = 2045) {
  const years = [];
  const base = [];
  const adjusted = [];
  const pct = inputs.ttfAdjustmentPct ?? 0;
  for (let y = yearStart; y <= yearEnd; y++) {
    years.push(y);
    const b = resolveBaseTtfAnnual(data, y, inputs);
    base.push(b);
    adjusted.push(applyTtfAdjustmentPct(b, pct));
  }
  return { years, base, adjusted };
}

/**
 * EEG capacity trajectory × active wind-year / demand scenario → supply mix TWh.
 * Renewables = solar + wind generation (visibility × yield anchors via runScenario).
 * Gas & other = demand − renewables (residual, not gas alone).
 */
export function buildSupplyMixSeries(data, inputs, yearStart = 2025, yearEnd = 2045) {
  const caps2025 = emberCaps2025(data);
  const years = [];
  const renewables_twh = [];
  const gas_and_other_twh = [];
  const demand_twh = [];
  for (let y = yearStart; y <= yearEnd; y++) {
    const cap = eegCapacityAt(y, caps2025);
    const result = runScenario(data, {
      year: y,
      demandGrowthScenario: inputs.demandGrowthScenario,
      solarCapacityGW: cap.solar,
      windCapacityGW: cap.wind,
      windYearType: inputs.windYearType,
      supplyScenario: "base_case",
      ttfAdjustmentPct: 0,
    });
    const vre = result.annual.vre_generation_mwh / 1e6;
    const dem = result.demand.demand_year_twh;
    years.push(y);
    renewables_twh.push(vre);
    demand_twh.push(dem);
    gas_and_other_twh.push(dem - vre);
  }
  return { years, renewables_twh, gas_and_other_twh, demand_twh };
}

function validateInputs(inputs) {
  const { year, solarCapacityGW, windCapacityGW } = inputs;
  if (year < 2025 || year > 2045 || !Number.isInteger(year)) {
    throw new Error(`year must be an integer in 2025–2045, got ${year}`);
  }
  if (!(solarCapacityGW >= 0) || !(windCapacityGW >= 0)) {
    throw new Error("capacities must be non-negative");
  }
}

function indexCells(cells, field) {
  const m = new Map();
  for (const c of cells) m.set(`${c.season}|${c.block}`, c[field]);
  return m;
}

function indexDemand(cells) {
  const m = new Map();
  for (const c of cells) m.set(`${c.season}|${c.block}`, c.load_energy_share);
  return m;
}

function indexBins(bins, valueField) {
  const m = new Map();
  for (const b of bins) {
    m.set(b.vre_bin_left, {
      value: b[valueField],
      flag: b.p_neg_flag || b.lock_flag || null,
    });
  }
  // For delta map, store bare number for simpler lookup path
  if (valueField === "delta_eur_mwh") {
    const n = new Map();
    for (const b of bins) n.set(b.vre_bin_left, b.delta_eur_mwh);
    return n;
  }
  return m;
}

function indexBuckets(bins) {
  const m = new Map();
  for (const b of bins) {
    m.set(b.vre_bin_left, {
      s_gas: b.s_gas,
      s_neg: b.s_neg,
      s_res: b.s_res,
    });
  }
  return m;
}

function indexDiscounts(mvfDiscounts) {
  const m = new Map();
  if (!mvfDiscounts?.cells) return m;
  for (const c of mvfDiscounts.cells) {
    m.set(`${c.season}|${c.block}`, {
      wind_discount_eur_mwh: c.wind_discount_eur_mwh,
      solar_discount_eur_mwh: c.solar_discount_eur_mwh,
    });
  }
  return m;
}

function sum(arr, fn) {
  let t = 0;
  for (const x of arr) t += fn(x);
  return t;
}

/**
 * Load all JSON files from a base URL (browser) or return a loader for Node.
 * @param {string} baseUrl  e.g. './im_data/'
 */
export async function loadDataFromUrls(baseUrl) {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const files = {
    solar: "shape_solar_season_block.json",
    wind: "shape_wind_season_block.json",
    demand: "shape_demand_season_block.json",
    delta: "delta_by_vre_bin.json",
    pNeg: "p_neg_by_vre_bin.json",
    demandGrowth: "demand_growth_scenarios.json",
    gasSrmc: "gas_srmc_params.json",
    ttf: "ttf_forward_curve.json",
    eua: "eua_forward_curve.json",
    buckets: "bucket_shares_by_vre_bin.json",
    mvfDiscounts: "within_cell_mvf_discounts.json",
    visibility: "grid_visibility_factors.json",
    seasonalCommodities: "seasonal_commodity_means.json",
    gasDispatchOverlay: "gas_dispatch_overlay.json",
    historical: "historical_reference_years.json",
  };
  const data = {};
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
      data[key] = await res.json();
    })
  );
  return data;
}

/**
 * Node helper: load from a filesystem directory.
 * @param {string} dir
 * @param {(p: string) => string} readFileSync
 */
export function loadDataFromDir(dir, readFileSync) {
  const pathJoin = (a, b) => a.replace(/\/$/, "") + "/" + b;
  const read = (f) => JSON.parse(readFileSync(pathJoin(dir, f), "utf8"));
  return {
    solar: read("shape_solar_season_block.json"),
    wind: read("shape_wind_season_block.json"),
    demand: read("shape_demand_season_block.json"),
    delta: read("delta_by_vre_bin.json"),
    pNeg: read("p_neg_by_vre_bin.json"),
    demandGrowth: read("demand_growth_scenarios.json"),
    gasSrmc: read("gas_srmc_params.json"),
    ttf: read("ttf_forward_curve.json"),
    eua: read("eua_forward_curve.json"),
    buckets: read("bucket_shares_by_vre_bin.json"),
    mvfDiscounts: read("within_cell_mvf_discounts.json"),
    visibility: read("grid_visibility_factors.json"),
    seasonalCommodities: read("seasonal_commodity_means.json"),
    gasDispatchOverlay: read("gas_dispatch_overlay.json"),
    historical: read("historical_reference_years.json"),
  };
}

/**
 * Compare a scenario result to a historical reference year.
 */
export function compareToHistorical(result, histYear) {
  const avg = result.annual.avg_price_eur_mwh;
  const vre = result.annual.vre_share_of_demand;
  const solarMvf = result.annual.solar_mvf;
  const windMvf = result.annual.wind_mvf;

  const d = (a, b) => ({
    model: a,
    actual: b,
    abs: a - b,
    pct: b !== 0 ? ((a - b) / b) * 100 : null,
  });

  return {
    year: histYear.year,
    avg_price_eur_mwh: d(avg, histYear.avg_price_eur_mwh),
    // Note: model VRE is share of DEMAND; historical is share of GENERATION
    vre_share: {
      model_of_demand: vre,
      actual_of_generation: histYear.vre_share_of_generation,
      abs_vs_gen_share: vre - histYear.vre_share_of_generation,
      note: "Different denominators — demand (scenario) vs generation (historical)",
    },
    solar_mvf: d(solarMvf, histYear.mvf.solar),
    wind_mvf: d(windMvf, histYear.mvf.wind_fleet_blend),
  };
}
