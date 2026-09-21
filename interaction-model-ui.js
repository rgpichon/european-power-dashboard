/**
 * Interaction Model tab — v1 presentation over scenarioEngine.js.
 */
import {
  runScenario,
  loadDataFromUrls,
  buildTtfAnnualPath,
  buildSupplyMixSeries,
  eegCapacityAt,
  emberCaps2025,
  computeAnnualStateAggregate
} from "./im_engine/scenarioEngine.js?v=20260917eua1";

var BASE_CASE = {
  year: 2025,
  demandGrowthScenario: "B",
  solarCapacityGW: 106.27,
  windCapacityGW: 77.81,
  windYearType: "base",
  ttfAdjustmentPct: 0,
  supplyScenario: "base_case"
};

var SUPPLY_SCENARIO_STRESS = {
  normal: 0,
  hormuz: 22.6,
  us_delayed: 16
};

var PRESETS = [
  {
    id: "today",
    label: "Today (2025)",
    tooltip:
      "Actual 2025 installed capacity and demand — the baseline every other scenario is compared against.",
    values: {
      year: 2025,
      solarCapacityPct: 100,
      windCapacityPct: 100,
      windYearType: "base",
      demandGrowthScenario: "B",
      ttfAdjustmentPct: 0,
      supplyScenario: "normal"
    }
  },
  {
    id: "2030-on-track",
    label: "2030 · on track",
    tooltip:
      "Germany's official 2030 renewable buildout targets (215GW solar, 115GW wind, per EEG).",
    values: {
      year: 2030,
      solarCapacityPct: 100,
      windCapacityPct: 100,
      windYearType: "base",
      demandGrowthScenario: "B",
      ttfAdjustmentPct: 0,
      supplyScenario: "normal"
    }
  },
  {
    id: "hormuz",
    label: "Hormuz/Qatar disruption",
    tooltip:
      "TTF adjustment based on the real 2026 Iran–Qatar conflict's impact on Ras Laffan LNG exports (+22.6%, per Vortexa's own analyst estimate).",
    values: null // filled after data load with 2026 EEG-path capacities
  }
];

var DEFAULTS = PRESETS[0].values;

window.IMState = {
  year: 2025,
  ttfAdjustmentPct: 0,
  solarPct: 100,
  windPct: 100,
  windYear: "base",
  demandScenario: "B"
};

var SEASONS = ["DJF", "MAM", "JJA", "SON"];
var BLOCKS = ["night", "morning", "afternoon", "evening"];
var BLOCK_LABELS = {
  night: "Night",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening"
};

var GRAY_SCALE = [
  [0, "#F9FAFB"],
  [0.25, "#D1D5DB"],
  [0.5, "#9CA3AF"],
  [0.75, "#374151"],
  [1, "#111827"]
];

var state = {
  data: null,
  loading: false,
  baseResult: null,
  lastScenarioResult: null,
  lastAggregate: null,
  activePresetId: null,
  suppressDeselect: false,
  chartDebounceTimer: null
};

var CHART_DEBOUNCE_MS = 150;
var SEG_MIN_FLEX = 0.18;

function $(id) {
  return document.getElementById(id);
}

function colors() {
  return window.DataColors || {};
}

function theme() {
  return window.PlotlyTheme || null;
}

function fmtPrice(v) {
  if (!Number.isFinite(v)) return "—";
  return "€" + v.toFixed(1) + "/MWh";
}

function fmtPct(v) {
  if (!Number.isFinite(v)) return "—";
  return (v * 100).toFixed(1) + "%";
}

function fmtGw(v) {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(1) + " GW";
}

function demandTwhToAvgGw(twh) {
  return (twh * 1000) / 8760;
}

function getOnTrackCaps(year) {
  if (!state.data) return { solar: NaN, wind: NaN };
  return eegCapacityAt(year, emberCaps2025(state.data));
}

function capacityPctToGw(pct, refGw) {
  if (!Number.isFinite(pct) || !Number.isFinite(refGw) || refGw <= 0) return NaN;
  return (pct / 100) * refGw;
}

function capacityGwToPct(gw, refGw) {
  if (!Number.isFinite(gw) || !Number.isFinite(refGw) || refGw <= 0) return NaN;
  return (gw / refGw) * 100;
}

function formatCapacityHint(pct, gw) {
  if (!Number.isFinite(pct)) return "—";
  var pctStr = Math.abs(pct - Math.round(pct)) < 0.05 ? String(Math.round(pct)) : pct.toFixed(1);
  if (!Number.isFinite(gw)) return pctStr + "% → — GW";
  return pctStr + "% → " + gw.toFixed(1) + " GW";
}

function updateCapacityHints() {
  var year = parseInt($("im-year-scrubber").value, 10);
  var onTrack = getOnTrackCaps(year);
  var solarPct = parseFloat($("im-solar").value);
  var windPct = parseFloat($("im-wind").value);
  var solarTip = $("im-solar-tip");
  var windTip = $("im-wind-tip");
  var solarBase =
    "Percentage of on-track EEG-path solar capacity for the selected year (100% = eegCapacityAt(Year)). Installed capacity — not the electricity actually produced.";
  var windBase =
    "Percentage of on-track EEG-path wind capacity for the selected year (100% = eegCapacityAt(Year)). Installed capacity — not the electricity actually produced.";
  var solarHint = formatCapacityHint(solarPct, capacityPctToGw(solarPct, onTrack.solar));
  var windHint = formatCapacityHint(windPct, capacityPctToGw(windPct, onTrack.wind));
  if (solarTip) {
    var solarText = solarBase + " Currently: " + solarHint + ".";
    solarTip.setAttribute("title", solarText);
    solarTip.setAttribute("aria-label", solarText);
  }
  if (windTip) {
    var windText = windBase + " Currently: " + windHint + ".";
    windTip.setAttribute("title", windText);
    windTip.setAttribute("aria-label", windText);
  }
}

function syncIMStateFromUI() {
  var yearEl = $("im-year-scrubber");
  var stressEl = $("im-stress-scrubber");
  var solarEl = $("im-solar");
  var windEl = $("im-wind");
  var windYearEl = $("im-wind-year");
  var demandEl = $("im-demand");
  if (!window.IMState) return;
  if (yearEl) window.IMState.year = parseInt(yearEl.value, 10);
  if (stressEl) window.IMState.ttfAdjustmentPct = parseFloat(stressEl.value);
  if (solarEl) window.IMState.solarPct = parseFloat(solarEl.value);
  if (windEl) window.IMState.windPct = parseFloat(windEl.value);
  if (windYearEl) window.IMState.windYear = windYearEl.value;
  if (demandEl) window.IMState.demandScenario = demandEl.value;
  // Plant Economics reads IMState via buildImLinkedPricePath — keep it live.
  if (typeof window.__peRecalculate === "function") {
    window.__peRecalculate();
  }
}

function inputsFromIMState() {
  var s = window.IMState || {};
  var year = Number.isFinite(s.year) ? s.year : 2025;
  var onTrack = getOnTrackCaps(year);
  return {
    year: year,
    solarCapacityGW: capacityPctToGw(
      Number.isFinite(s.solarPct) ? s.solarPct : 100,
      onTrack.solar
    ),
    windCapacityGW: capacityPctToGw(
      Number.isFinite(s.windPct) ? s.windPct : 100,
      onTrack.wind
    ),
    windYearType: s.windYear || "base",
    demandGrowthScenario: s.demandScenario || "B",
    ttfAdjustmentPct: Number.isFinite(s.ttfAdjustmentPct) ? s.ttfAdjustmentPct : 0,
    supplyScenario: "base_case"
  };
}

function syncScrubberLabels() {
  var yearEl = $("im-year-scrubber");
  var stressEl = $("im-stress-scrubber");
  var yearLabel = $("im-year-label");
  var stressLabel = $("im-stress-label");
  if (yearEl && yearLabel) {
    yearLabel.textContent = String(yearEl.value);
    yearEl.setAttribute("aria-valuenow", yearEl.value);
  }
  if (stressEl && stressLabel) {
    var n = parseFloat(stressEl.value);
    var txt = "—";
    if (Number.isFinite(n)) {
      txt = Math.abs(n) < 0.05 ? "0%" : (n > 0 ? "+" : "") + n.toFixed(1) + "%";
    }
    stressLabel.textContent = txt;
    stressEl.setAttribute("aria-valuenow", stressEl.value);
  }
}

function readInputs() {
  var year = parseInt($("im-year-scrubber").value, 10);
  var onTrack = getOnTrackCaps(year);
  var solarPct = parseFloat($("im-solar").value);
  var windPct = parseFloat($("im-wind").value);
  return {
    year: year,
    solarCapacityGW: capacityPctToGw(solarPct, onTrack.solar),
    windCapacityGW: capacityPctToGw(windPct, onTrack.wind),
    windYearType: $("im-wind-year").value,
    demandGrowthScenario: $("im-demand").value,
    ttfAdjustmentPct: parseFloat($("im-stress-scrubber").value),
    supplyScenario: "base_case"
  };
}

function applyInputs(values) {
  state.suppressDeselect = true;
  if ($("im-year-scrubber") && values.year != null) {
    $("im-year-scrubber").value = values.year;
  }
  var onTrack = getOnTrackCaps(values.year);
  var solarPct = values.solarCapacityPct;
  var windPct = values.windCapacityPct;
  if (solarPct == null && values.solarCapacityGW != null) {
    solarPct = capacityGwToPct(values.solarCapacityGW, onTrack.solar);
  }
  if (windPct == null && values.windCapacityGW != null) {
    windPct = capacityGwToPct(values.windCapacityGW, onTrack.wind);
  }
  if (Number.isFinite(solarPct)) $("im-solar").value = solarPct;
  if (Number.isFinite(windPct)) $("im-wind").value = windPct;
  $("im-wind-year").value = values.windYearType;
  $("im-demand").value = values.demandGrowthScenario;
  if ($("im-stress-scrubber") && values.ttfAdjustmentPct != null) {
    $("im-stress-scrubber").value = values.ttfAdjustmentPct;
  }
  if ($("im-supply-scenario") && values.supplyScenario != null) {
    $("im-supply-scenario").value = values.supplyScenario;
  }
  syncScrubberLabels();
  updateCapacityHints();
  syncIMStateFromUI();
  state.suppressDeselect = false;
}

function setStatus(msg, isError) {
  var el = $("im-status");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
  el.classList.toggle("im-status--error", !!isError);
}

function setLoading(on) {
  state.loading = on;
  var runBtn = $("im-run-btn");
  if (runBtn) runBtn.disabled = on;
  document.querySelectorAll(".im-preset-link").forEach(function (btn) {
    btn.disabled = on;
  });
}

function setActivePreset(id) {
  state.activePresetId = id;
  document.querySelectorAll(".im-preset-link").forEach(function (b) {
    b.classList.toggle("is-active", b.dataset.presetId === id);
  });
}

function clearActivePreset() {
  if (state.suppressDeselect) return;
  setActivePreset(null);
}

function lerpColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (var i = 1; i < GRAY_SCALE.length; i++) {
    if (t <= GRAY_SCALE[i][0]) {
      var t0 = GRAY_SCALE[i - 1][0];
      var t1 = GRAY_SCALE[i][0];
      var c0 = GRAY_SCALE[i - 1][1];
      var c1 = GRAY_SCALE[i][1];
      var u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return mixHex(c0, c1, u);
    }
  }
  return GRAY_SCALE[GRAY_SCALE.length - 1][1];
}

function mixHex(a, b, t) {
  var ar = parseInt(a.slice(1, 3), 16);
  var ag = parseInt(a.slice(3, 5), 16);
  var ab = parseInt(a.slice(5, 7), 16);
  var br = parseInt(b.slice(1, 3), 16);
  var bg = parseInt(b.slice(3, 5), 16);
  var bb = parseInt(b.slice(5, 7), 16);
  var r = Math.round(ar + (br - ar) * t);
  var g = Math.round(ag + (bg - ag) * t);
  var bl = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bl].map(function (x) {
    return x.toString(16).padStart(2, "0");
  }).join("");
}

function textOnGray(bgHex) {
  var r = parseInt(bgHex.slice(1, 3), 16);
  var g = parseInt(bgHex.slice(3, 5), 16);
  var b = parseInt(bgHex.slice(5, 7), 16);
  var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? (colors().ink || "#111827") : "#FFFFFF";
}

function endLabelAnnotation(x, y, text, color, xanchor) {
  return {
    x: x,
    y: y,
    text: text,
    showarrow: false,
    xanchor: xanchor || "left",
    yanchor: "middle",
    xshift: xanchor === "right" ? -4 : 6,
    font: { size: 10, color: color, family: theme() && theme().font }
  };
}

function ensureBaseResult() {
  if (!state.baseResult && state.data) {
    state.baseResult = runScenario(state.data, BASE_CASE);
  }
  return state.baseResult;
}

/** Same threshold as duration curve red segments and heatmap negative cells. */
function countNegativePriceBlocks(cells) {
  if (!cells) return 0;
  return cells.filter(function (c) {
    return Number.isFinite(c.price_eur_mwh) && c.price_eur_mwh < 0;
  }).length;
}

/**
 * Comparison metrics from runScenario result.
 * Fields: annual.avg_price_eur_mwh, annual.vre_share_of_demand,
 * annual.solar_generation_mwh / annual.demand_mwh, annual.wind_generation_mwh / annual.demand_mwh,
 * demand.demand_year_twh, cells[].price_eur_mwh
 */
/** Coerce model outputs that may arrive as numeric strings after JSON/serialization. */
function toNum(v) {
  if (v == null || v === "") return NaN;
  var n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function comparisonMetrics(result) {
  if (!result || !result.annual || !result.demand) return null;
  var demMwh = toNum(result.annual.demand_mwh);
  var solarGen = toNum(result.annual.solar_generation_mwh);
  var windGen = toNum(result.annual.wind_generation_mwh);
  var solarShare = demMwh > 0 ? solarGen / demMwh : NaN;
  var windShare = demMwh > 0 ? windGen / demMwh : NaN;
  return {
    avg_price_eur_mwh: toNum(result.annual.avg_price_eur_mwh),
    vre_share_of_demand: toNum(result.annual.vre_share_of_demand),
    solar_share_of_demand: solarShare,
    wind_share_of_demand: windShare,
    demand_year_twh: toNum(result.demand.demand_year_twh),
    negative_blocks: countNegativePriceBlocks(result.cells)
  };
}

function fmtComparePrice(v) {
  var n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  return "€" + n.toFixed(1) + "/MWh";
}

function fmtComparePctShare(v) {
  var n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtCompareDemandTwh(v) {
  var n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1) + " TWh";
}

function setCmpText(id, text) {
  var el = $(id);
  if (el) el.textContent = text;
}

function setCoverageBar(el, pctShare) {
  if (!el) return;
  var n = toNum(pctShare);
  var pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n * 100)) : 0;
  el.style.width = pct.toFixed(1) + "%";
}

function renderComparePanel(scenarioResult) {
  var baseResult = ensureBaseResult();
  if (!baseResult || !scenarioResult) return;

  var base = comparisonMetrics(baseResult);
  var scen = comparisonMetrics(scenarioResult);
  if (!base || !scen) return;

  setCmpText("im-cmp-base-price", fmtComparePrice(base.avg_price_eur_mwh));
  setCmpText("im-cmp-scen-price", fmtComparePrice(scen.avg_price_eur_mwh));

  setCmpText("im-cmp-base-vre", fmtComparePctShare(base.vre_share_of_demand));
  setCmpText("im-cmp-scen-vre", fmtComparePctShare(scen.vre_share_of_demand));
  setCoverageBar($("im-cmp-base-vre-bar"), base.vre_share_of_demand);
  setCoverageBar($("im-cmp-scen-vre-bar"), scen.vre_share_of_demand);

  setCmpText("im-cmp-base-solar", fmtComparePctShare(base.solar_share_of_demand));
  setCmpText("im-cmp-scen-solar", fmtComparePctShare(scen.solar_share_of_demand));
  setCmpText("im-cmp-base-wind", fmtComparePctShare(base.wind_share_of_demand));
  setCmpText("im-cmp-scen-wind", fmtComparePctShare(scen.wind_share_of_demand));

  setCmpText("im-cmp-base-demand", fmtCompareDemandTwh(base.demand_year_twh));
  setCmpText("im-cmp-scen-demand", fmtCompareDemandTwh(scen.demand_year_twh));

  setCmpText("im-cmp-base-neg", base.negative_blocks + " / 16");
  setCmpText("im-cmp-scen-neg", scen.negative_blocks + " / 16");
}

function renderHeadline(scenarioPrice, basePrice) {
  var el = $("im-headline");
  if (!el || !Number.isFinite(scenarioPrice) || !Number.isFinite(basePrice) || basePrice === 0) {
    if (el) el.textContent = "—";
    return;
  }
  var pct = ((scenarioPrice - basePrice) / basePrice) * 100;
  var absPct = Math.abs(pct).toFixed(0);
  var dir = pct > 0.05 ? "above" : pct < -0.05 ? "below" : "in line with";
  var cls = pct > 0.05 ? "im-hl-pct--up" : pct < -0.05 ? "im-hl-pct--down" : "";
  var pctHtml =
    dir === "in line with"
      ? "in line with"
      : '<span class="' + cls + '">' + absPct + "% " + dir + "</span>";
  el.innerHTML =
    "Average price €" +
    scenarioPrice.toFixed(1) +
    "/MWh — " +
    pctHtml +
    " the 2025 baseline.";
}

function fmtSegPrice(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return "€" + v.toFixed(1);
}

function fmtSegShare(v) {
  if (!Number.isFinite(v)) return "—";
  return (v * 100).toFixed(0) + "% of hours";
}

function pulseSegments(segIds) {
  if (!segIds || !segIds.length) return;
  segIds.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.classList.remove("is-pulse");
    // reflow so repeated pulses retrigger
    void el.offsetWidth;
    el.classList.add("is-pulse");
    window.setTimeout(function () {
      el.classList.remove("is-pulse");
    }, 650);
  });
}

function renderStateBar(agg, pulseKind, root) {
  if (!agg) return;
  root = root || $("im-state-bar");
  if (!root) return;

  var segments = [
    { seg: "neg", share: agg.S_neg, price: agg.P_neg },
    { seg: "res", share: agg.S_res, price: agg.P_res },
    { seg: "gas", share: agg.S_gas, price: agg.P_gas }
  ];

  segments.forEach(function (seg) {
    var el = root.querySelector('[data-seg="' + seg.seg + '"]');
    if (!el) return;
    var flex = Math.max(SEG_MIN_FLEX, Number.isFinite(seg.share) ? seg.share : 0);
    el.style.flexGrow = String(flex);
    el.style.flexBasis = "0";
    var priceEl = el.querySelector(".im-state-seg-price");
    var shareEl = el.querySelector(".im-state-seg-share");
    if (priceEl) priceEl.textContent = fmtSegPrice(seg.price);
    if (shareEl) shareEl.textContent = fmtSegShare(seg.share);
  });

  if (!pulseKind) return;
  var pulseSegs = [];
  if (pulseKind === "year") pulseSegs = ["neg", "gas"];
  else if (pulseKind === "stress") pulseSegs = ["gas"];
  else if (pulseKind === "both") pulseSegs = ["neg", "res", "gas"];
  pulseSegs.forEach(function (seg) {
    var el = root.querySelector('[data-seg="' + seg + '"]');
    if (!el) return;
    el.classList.remove("is-pulse");
    void el.offsetWidth;
    el.classList.add("is-pulse");
    window.setTimeout(function () {
      el.classList.remove("is-pulse");
    }, 650);
  });
}

function renderChartsAndDetail(scenarioResult, inputs) {
  renderTtfChart(inputs);
  renderDurationChart(scenarioResult);
  renderSupplyChart(inputs);
  renderRecap(scenarioResult);
  renderCapacityBar(inputs, scenarioResult);
  renderPriceHeatmap(scenarioResult.cells);
  renderCellTable(scenarioResult.cells);
  renderComparePanel(scenarioResult);
  $("im-output").hidden = false;
  if (typeof window.__requestViewportFit === "function") {
    window.__requestViewportFit("interaction");
  }
}

function scheduleChartRefresh(scenarioResult, inputs) {
  if (state.chartDebounceTimer) {
    window.clearTimeout(state.chartDebounceTimer);
    state.chartDebounceTimer = null;
  }
  state.chartDebounceTimer = window.setTimeout(function () {
    state.chartDebounceTimer = null;
    renderChartsAndDetail(scenarioResult, inputs);
  }, CHART_DEBOUNCE_MS);
}

function applyLiveAggregate(agg, inputs, opts) {
  opts = opts || {};
  syncIMStateFromUI();
  state.lastAggregate = agg;
  state.lastScenarioResult = agg.scenarioResult;
  var baseResult = ensureBaseResult();
  var basePrice = baseResult ? toNum(baseResult.annual.avg_price_eur_mwh) : NaN;
  renderStateBar(agg, opts.pulseKind || null);
  renderHeadline(toNum(agg.avg_price_eur_mwh), basePrice);
  if (opts.charts === "immediate") {
    if (state.chartDebounceTimer) {
      window.clearTimeout(state.chartDebounceTimer);
      state.chartDebounceTimer = null;
    }
    renderChartsAndDetail(agg.scenarioResult, inputs);
  } else if (opts.charts === "debounce") {
    scheduleChartRefresh(agg.scenarioResult, inputs);
  }
}

function liveUpdate(opts) {
  opts = opts || {};
  if (!state.data) return;
  try {
    var inputs = readInputs();
    ensureBaseResult();
    var agg = computeAnnualStateAggregate(state.data, inputs);
    applyLiveAggregate(agg, inputs, opts);
    setStatus("");
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
}

function renderOutput(scenarioResult, inputs) {
  // Legacy entry used by full Run: wrap as aggregate path for consistency
  var agg = computeAnnualStateAggregate(state.data, inputs);
  applyLiveAggregate(agg, inputs, { charts: "immediate", pulseKind: null });
}

function runCalculation(opts) {
  opts = opts || {};
  if (!state.data) {
    setStatus("Model data not loaded yet.", true);
    return;
  }
  setStatus("");
  try {
    var inputs = readInputs();
    ensureBaseResult();
    var agg = computeAnnualStateAggregate(state.data, inputs);
    var pulseKind = Object.prototype.hasOwnProperty.call(opts, "pulseKind")
      ? opts.pulseKind
      : "both";
    applyLiveAggregate(agg, inputs, {
      charts: "immediate",
      pulseKind: pulseKind
    });
  } catch (err) {
    $("im-output").hidden = true;
    setStatus(err.message || String(err), true);
  }
}

function renderTtfChart(inputs) {
  var el = $("im-ttf-chart");
  var PT = theme();
  if (!el || !state.data || typeof Plotly === "undefined" || !PT) return;

  var series = buildTtfAnnualPath(state.data, inputs);
  var C = PT.colors;
  var last = series.years.length - 1;

  var baseTrace = PT.lineTrace(series.years, series.base, {
    name: "Baseline",
    color: C.grey,
    width: 1.5,
    line: { dash: "dash", color: C.grey, width: 1.5 },
    hovertemplate: "%{x}<br>€%{y:.1f}/MWh<extra>Baseline</extra>",
    extra: { showlegend: false }
  });

  var adjTrace = PT.lineTrace(series.years, series.adjusted, {
    name: "Scenario",
    color: C.text,
    width: 2,
    hovertemplate: "%{x}<br>€%{y:.1f}/MWh<extra>Scenario</extra>",
    extra: { showlegend: false }
  });

  var layout = PT.cartesianLayout({
    margin: { t: 16, r: 72, b: 40, l: 48 },
    showlegend: false,
    xaxis: {
      title: { text: "" },
      dtick: 5,
      tick0: 2025
    },
    yaxis: {
      title: { text: "€/MWh" },
      rangemode: "tozero"
    },
    annotations: [
      endLabelAnnotation(series.years[last], series.base[last], "baseline", C.grey),
      endLabelAnnotation(series.years[last], series.adjusted[last], "scenario", C.text)
    ]
  });

  PT.newPlot(el, [baseTrace, adjTrace], layout);
}

function sortedPrices(cells) {
  return cells
    .map(function (c) { return c.price_eur_mwh; })
    .filter(Number.isFinite)
    .sort(function (a, b) { return b - a; });
}

/** Split a sorted series into dark (non-neg) and red (neg) line segments. */
function durationTraces(x, y, name, solidColor, dash) {
  var PT = theme();
  var C = PT.colors;
  var bad = colors().bad || "#DC2626";
  var traces = [];
  var i = 0;
  while (i < y.length) {
    var neg = y[i] < 0;
    var xs = [x[i]];
    var ys = [y[i]];
    var j = i + 1;
    while (j < y.length && (y[j] < 0) === neg) {
      xs.push(x[j]);
      ys.push(y[j]);
      j++;
    }
    // connect across boundary
    if (j < y.length) {
      xs.push(x[j]);
      ys.push(y[j]);
    }
    var color = neg ? bad : solidColor;
    traces.push(
      PT.lineTrace(xs, ys, {
        name: name,
        color: color,
        width: dash ? 1.5 : 2,
        line: { dash: dash || "solid", color: color, width: dash ? 1.5 : 2 },
        hovertemplate: "Block %{x}<br>€%{y:.1f}/MWh<extra>" + name + "</extra>",
        extra: { showlegend: false }
      })
    );
    i = j;
  }
  return traces;
}

function renderDurationChart(scenarioResult) {
  var el = $("im-duration-chart");
  var PT = theme();
  var base = ensureBaseResult();
  if (!el || !base || typeof Plotly === "undefined" || !PT) return;

  var scen = sortedPrices(scenarioResult.cells);
  var basePrices = sortedPrices(base.cells);
  var n = Math.max(scen.length, basePrices.length);
  var x = [];
  for (var i = 1; i <= n; i++) x.push(i);

  while (scen.length < n) scen.push(null);
  while (basePrices.length < n) basePrices.push(null);

  var C = PT.colors;
  var traces = []
    .concat(durationTraces(x, basePrices, "Baseline", C.grey, "dash"))
    .concat(durationTraces(x, scen, "Scenario", C.text, null));

  var lastScen = scen[scen.length - 1];
  var lastBase = basePrices[basePrices.length - 1];
  var layout = PT.cartesianLayout({
    margin: { t: 16, r: 72, b: 40, l: 48 },
    showlegend: false,
    xaxis: {
      title: { text: "Sorted blocks" },
      dtick: 1,
      range: [0.5, n + 0.5]
    },
    yaxis: {
      title: { text: "€/MWh" },
      zeroline: true,
      zerolinecolor: C.border
    },
    annotations: [
      endLabelAnnotation(n, lastBase, "baseline", C.grey),
      endLabelAnnotation(n, lastScen, "scenario", lastScen < 0 ? (colors().bad || "#DC2626") : C.text)
    ]
  });

  PT.newPlot(el, traces, layout);
}

function renderSupplyChart(inputs) {
  var el = $("im-supply-chart");
  var PT = theme();
  if (!el || !state.data || typeof Plotly === "undefined" || !PT) return;

  var series = buildSupplyMixSeries(state.data, inputs);
  var C = PT.colors;
  var last = series.years.length - 1;

  var reTrace = PT.lineTrace(series.years, series.renewables_twh, {
    name: "Renewables",
    color: C.text,
    width: 2,
    hovertemplate: "%{x}<br>%{y:.0f} TWh<extra>Renewables</extra>",
    extra: { showlegend: false }
  });

  var gasTrace = PT.lineTrace(series.years, series.gas_and_other_twh, {
    name: "Gas & other",
    color: C.grey,
    width: 1.75,
    line: { dash: "dash", color: C.grey, width: 1.75 },
    hovertemplate: "%{x}<br>%{y:.0f} TWh<extra>Gas & other, implied</extra>",
    extra: { showlegend: false }
  });

  var layout = PT.cartesianLayout({
    margin: { t: 16, r: 110, b: 40, l: 52 },
    showlegend: false,
    xaxis: { title: { text: "" }, dtick: 5, tick0: 2025 },
    yaxis: { title: { text: "TWh" }, rangemode: "tozero" },
    annotations: [
      endLabelAnnotation(
        series.years[last],
        series.renewables_twh[last],
        "renewables",
        C.text
      ),
      endLabelAnnotation(
        series.years[last],
        series.gas_and_other_twh[last],
        "gas & other, implied",
        C.grey
      )
    ]
  });

  PT.newPlot(el, [reTrace, gasTrace], layout);
}

function renderCellTable(cells) {
  var tbody = $("im-cell-tbody");
  if (!tbody || !cells) return;
  tbody.innerHTML = "";
  cells.forEach(function (c) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + c.season + "</td>" +
      "<td>" + c.block + "</td>" +
      "<td class=\"im-num\">" + fmtPct(c.vre_share) + "</td>" +
      "<td class=\"im-num\">" + fmtPrice(c.price_eur_mwh) + "</td>" +
      "<td class=\"im-num\">" + fmtPrice(c.srmc_eur_mwh) + "</td>" +
      "<td class=\"im-num\">" + fmtPrice(c.ttf_eur_mwh) + "</td>" +
      "<td class=\"im-num\">" + (Number.isFinite(c.delta_eur_mwh) ? c.delta_eur_mwh.toFixed(1) : "—") + "</td>";
    tbody.appendChild(tr);
  });
}

function renderCapacityBar(inputs, scenarioResult) {
  var solarGw = inputs.solarCapacityGW;
  var windGw = inputs.windCapacityGW;
  var totalRe = solarGw + windGw;
  var demandGw = demandTwhToAvgGw(scenarioResult.demand.demand_year_twh);
  var scale = Math.max(totalRe, demandGw, 1);
  var stackPct = (totalRe / scale) * 100;
  var demandPct = (demandGw / scale) * 100;
  var coverPct = demandGw > 0 ? (totalRe / demandGw) * 100 : NaN;

  var stack = $("im-cap-stack");
  var solarEl = $("im-cap-solar");
  var windEl = $("im-cap-wind");
  var demandLine = $("im-cap-demand-line");
  var legend = $("im-cap-legend");
  var pctEl = $("im-cap-pct");

  if (!stack || !solarEl || !windEl) return;

  stack.style.width = stackPct.toFixed(2) + "%";
  solarEl.style.flex = String(solarGw);
  windEl.style.flex = String(windGw);

  if (demandLine) {
    demandLine.hidden = false;
    demandLine.style.left = demandPct.toFixed(2) + "%";
  }

  if (legend) {
    legend.innerHTML =
      "<span class=\"im-cap-legend-item\"><span class=\"im-cap-swatch im-cap-swatch--solar\"></span>Solar " + fmtGw(solarGw) + "</span>" +
      "<span class=\"im-cap-legend-item\"><span class=\"im-cap-swatch im-cap-swatch--wind\"></span>Wind " + fmtGw(windGw) + "</span>" +
      "<span class=\"im-cap-legend-item\"><span class=\"im-cap-swatch im-cap-swatch--demand\"></span>Avg demand " + fmtGw(demandGw) + "</span>";
  }

  if (pctEl) {
    pctEl.textContent = Number.isFinite(coverPct) ? coverPct.toFixed(0) + "%" : "—";
  }
}

function cellMap(cells) {
  var map = new Map();
  cells.forEach(function (c) {
    map.set(c.season + "|" + c.block, c);
  });
  return map;
}

function renderPriceHeatmap(cells) {
  var root = $("im-price-heatmap");
  if (!root || !cells) return;

  var byKey = cellMap(cells);
  var prices = cells.map(function (c) { return c.price_eur_mwh; }).filter(Number.isFinite);
  var minP = Math.min.apply(null, prices.concat([0]));
  var maxP = Math.max.apply(null, prices);

  root.innerHTML = "";
  root.appendChild(document.createElement("div")).className = "im-heatmap-corner";

  BLOCKS.forEach(function (block, colIdx) {
    var head = document.createElement("div");
    head.className = "im-heatmap-colhead";
    head.style.gridColumn = String(colIdx + 2);
    head.style.gridRow = "1";
    head.textContent = BLOCK_LABELS[block];
    root.appendChild(head);
  });

  SEASONS.forEach(function (season, rowIdx) {
    var rowHead = document.createElement("div");
    rowHead.className = "im-heatmap-rowhead";
    rowHead.style.gridColumn = "1";
    rowHead.style.gridRow = String(rowIdx + 2);
    rowHead.textContent = season;
    root.appendChild(rowHead);

    BLOCKS.forEach(function (block, colIdx) {
      var cell = byKey.get(season + "|" + block);
      var price = cell ? cell.price_eur_mwh : NaN;
      var el = document.createElement("div");
      el.className = "im-heatmap-cell";
      el.style.gridColumn = String(colIdx + 2);
      el.style.gridRow = String(rowIdx + 2);

      var isNegative = Number.isFinite(price) && price < 0;
      if (isNegative) {
        el.classList.add("im-heatmap-cell--negative");
        el.style.background = colors().g6 || "#F3F4F6";
        el.textContent = price.toFixed(1);
      } else {
        var t = maxP > minP ? (price - minP) / (maxP - minP) : 0;
        var bg = lerpColor(t);
        el.style.background = bg;
        el.style.color = textOnGray(bg);
        el.textContent = Number.isFinite(price) ? price.toFixed(1) : "—";
      }

      el.title = season + " · " + BLOCK_LABELS[block] + ": " + fmtPrice(price);
      root.appendChild(el);
    });
  });
}

function renderRecap(scenarioResult) {
  var ttf = fmtPrice(scenarioResult.commodities.ttf_eur_mwh);
  var vre = fmtPct(scenarioResult.annual.vre_share_of_demand);
  var demand = scenarioResult.demand.demand_year_twh.toFixed(0) + " TWh";
  var source = scenarioResult.commodities.ttf_source || "—";

  var summary = $("im-recap-summary");
  if (summary) {
    summary.textContent = "TTF " + ttf + " · VRE " + vre + " of demand · " + demand;
  }

  var tipText =
    "Gas price used (TTF): " + ttf +
    ". Renewables' actual share of demand (generation): " + vre +
    ". Total demand: " + demand +
    ". Gas price data source: " + source + ".";

  var tip = $("im-recap-tip");
  if (tip) {
    tip.title = tipText;
    tip.setAttribute("aria-label", tipText);
  }

  var vreRef = $("im-cap-vre-ref");
  if (vreRef) vreRef.textContent = vre;
}

function fillHormuzPreset() {
  PRESETS[2].values = {
    year: 2026,
    solarCapacityPct: 100,
    windCapacityPct: 100,
    windYearType: "base",
    demandGrowthScenario: "B",
    ttfAdjustmentPct: 22.6,
    supplyScenario: "hormuz"
  };
}

async function ensureData() {
  if (state.data) return;
  setLoading(true);
  setStatus("Loading calibration data…");
  try {
    state.data = await loadDataFromUrls("./im_data/");
    fillHormuzPreset();
    ensureBaseResult();
    updateCapacityHints();
    setStatus("");
  } catch (err) {
    setStatus("Failed to load im_data/: " + (err.message || err), true);
    throw err;
  } finally {
    setLoading(false);
  }
}

function bindPresets() {
  var row = $("im-presets");
  if (!row) return;
  PRESETS.forEach(function (preset, idx) {
    if (idx > 0) {
      var sep = document.createElement("span");
      sep.className = "im-preset-sep";
      sep.textContent = "\u00a0\u00b7\u00a0";
      sep.setAttribute("aria-hidden", "true");
      row.appendChild(sep);
    }
    var link = document.createElement("button");
    link.type = "button";
    link.className = "im-preset-link";
    link.textContent = preset.label;
    link.title = preset.tooltip || "";
    link.dataset.presetId = preset.id;
    link.addEventListener("click", function () {
      if (!preset.values) return;
      applyInputs(preset.values);
      setActivePreset(preset.id);
      runCalculation({ pulseKind: "both" });
    });
    row.appendChild(link);
  });
}

function bindSupplyScenario() {
  var sel = $("im-supply-scenario");
  if (!sel) return;
  sel.addEventListener("change", function () {
    var stress = SUPPLY_SCENARIO_STRESS[sel.value];
    if (stress == null) stress = 0;
    state.suppressDeselect = true;
    if ($("im-stress-scrubber")) $("im-stress-scrubber").value = stress;
    syncScrubberLabels();
    state.suppressDeselect = false;
    clearActivePreset();
  });
}

function bindInputDeselect() {
  ["im-year-scrubber", "im-stress-scrubber", "im-solar", "im-wind", "im-wind-year", "im-demand", "im-supply-scenario"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", clearActivePreset);
    el.addEventListener("change", clearActivePreset);
  });
}

function bindCapacityHints() {
  ["im-year-scrubber", "im-solar", "im-wind"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", updateCapacityHints);
    el.addEventListener("change", updateCapacityHints);
  });
}

function bindPrimaryScrubbers() {
  var yearEl = $("im-year-scrubber");
  var stressEl = $("im-stress-scrubber");
  if (yearEl) {
    yearEl.addEventListener("input", function () {
      syncScrubberLabels();
      updateCapacityHints();
      liveUpdate({ charts: "debounce", pulseKind: "year" });
    });
  }
  if (stressEl) {
    stressEl.addEventListener("input", function () {
      syncScrubberLabels();
      // Keep supply-scenario dropdown in sync when stress matches a known preset stress
      var sel = $("im-supply-scenario");
      if (sel) {
        var v = parseFloat(stressEl.value);
        var matched = null;
        Object.keys(SUPPLY_SCENARIO_STRESS).forEach(function (key) {
          if (Math.abs(SUPPLY_SCENARIO_STRESS[key] - v) < 0.05) matched = key;
        });
        if (matched) sel.value = matched;
        else if (Math.abs(v) > 0.05) sel.value = "normal";
      }
      liveUpdate({ charts: "debounce", pulseKind: "stress" });
    });
  }
}

function bindAdvancedToggle() {
  var btn = $("im-advanced-toggle");
  var body = $("im-advanced");
  if (!btn || !body) return;
  btn.addEventListener("click", function () {
    var open = body.hidden;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Customize further ▾" : "Customize further ▸";
  });
}

function bindMethodologyToggle() {
  var btn = $("im-method-toggle");
  var body = $("im-method-body");
  if (!btn || !body) return;
  btn.addEventListener("click", function () {
    var open = body.hidden;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Hide full methodology ▾" : "Show full methodology ▸";
    if (typeof window.__requestViewportFit === "function") {
      window.__requestViewportFit("interaction");
    }
  });
}

function buildScenarioExportRows() {
  syncIMStateFromUI();
  var s = window.IMState || {};
  var solarPct = Number.isFinite(s.solarPct) ? s.solarPct : 100;
  var windPct = Number.isFinite(s.windPct) ? s.windPct : 100;
  var stress = Number.isFinite(s.ttfAdjustmentPct) ? s.ttfAdjustmentPct : 0;
  var scrubberYear = Number.isFinite(s.year) ? s.year : 2025;
  var windYear = s.windYear || "base";
  var demand = s.demandScenario || "B";
  var generatedAt = new Date().toISOString();

  var rows = [
    [
      "Interaction Model scenario export",
      "scrubber_year=" + scrubberYear,
      "gas_price_stress_pct=" + stress,
      "solar_pct=" + solarPct,
      "wind_pct=" + windPct,
      "wind_year=" + windYear,
      "demand_scenario=" + demand,
      "generated_at=" + generatedAt
    ],
    [
      "year",
      "TTF",
      "EUA",
      "SRMC",
      "P_gas",
      "P_res",
      "S_gas",
      "S_res",
      "S_neg"
    ]
  ];

  for (var year = 2025; year <= 2045; year++) {
    var onTrack = getOnTrackCaps(year);
    var agg = computeAnnualStateAggregate(state.data, {
      year: year,
      solarCapacityGW: capacityPctToGw(solarPct, onTrack.solar),
      windCapacityGW: capacityPctToGw(windPct, onTrack.wind),
      windYearType: windYear,
      demandGrowthScenario: demand,
      ttfAdjustmentPct: stress,
      supplyScenario: "base_case"
    });
    var c = agg.scenarioResult && agg.scenarioResult.commodities
      ? agg.scenarioResult.commodities
      : {};
    rows.push([
      year,
      c.ttf_eur_mwh,
      c.eua_eur_per_t,
      c.srmc_eur_mwh,
      agg.P_gas,
      agg.P_res,
      agg.S_gas,
      agg.S_res,
      agg.S_neg
    ]);
  }
  return rows;
}

function downloadScenarioExcel(e) {
  if (e) e.preventDefault();
  if (typeof XLSX === "undefined") {
    setStatus("Excel library failed to load — refresh and try again.", true);
    return Promise.reject(new Error("XLSX missing"));
  }
  return ensureData()
    .then(function () {
      var rows = buildScenarioExportRows();
      var sheet = XLSX.utils.aoa_to_sheet(rows);
      var book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Scenario");
      XLSX.writeFile(book, "interaction-model-scenario.xlsx");
      setStatus("Downloaded interaction-model-scenario.xlsx", false);
      return rows;
    })
    .catch(function (err) {
      setStatus(err && err.message ? err.message : "Download failed", true);
      throw err;
    });
}

function bindScenarioDownload() {
  var btn = $("im-download-scenario");
  if (!btn) return;
  btn.addEventListener("click", function (e) {
    downloadScenarioExcel(e);
  });
}

function initInteractionModelTab() {
  applyInputs(DEFAULTS);
  syncScrubberLabels();
  syncIMStateFromUI();
  bindPresets();
  bindSupplyScenario();
  bindInputDeselect();
  bindCapacityHints();
  bindPrimaryScrubbers();
  bindAdvancedToggle();
  bindMethodologyToggle();
  bindScenarioDownload();
  setActivePreset("today");

  ["im-solar", "im-wind", "im-wind-year", "im-demand"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", syncIMStateFromUI);
    el.addEventListener("change", syncIMStateFromUI);
  });

  $("im-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clearActivePreset();
    runCalculation({ pulseKind: "both" });
  });

  window.__onTabActivated.push(function (tabId) {
    if (tabId !== "interaction") return;
    ensureData()
      .then(function () {
        if ($("im-output").hidden) runCalculation({ pulseKind: null });
        else {
          if (state.lastScenarioResult) renderComparePanel(state.lastScenarioResult);
          ["im-ttf-chart", "im-duration-chart", "im-supply-chart"].forEach(function (id) {
            var el = $(id);
            if (el && typeof Plotly !== "undefined" && el.data) {
              try { Plotly.Plots.resize(el); } catch (e) { /* ignore */ }
            }
          });
        }
      })
      .catch(function () { /* status shown */ });
  });
}

window.__imRenderStateBar = function (root, agg) {
  renderStateBar(agg, null, root);
};

window.__imComputeAggregateFromSharedState = function () {
  return ensureData().then(function () {
    ensureBaseResult();
    var agg = computeAnnualStateAggregate(state.data, inputsFromIMState());
    var base = state.baseResult;
    return {
      agg: agg,
      baselinePrice: base ? toNum(base.annual.avg_price_eur_mwh) : NaN,
      imState: Object.assign({}, window.IMState)
    };
  });
};

window.__imDownloadScenarioExcel = downloadScenarioExcel;

initInteractionModelTab();
