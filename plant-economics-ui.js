/**
 * Plant Economics tab — live engine wired to form + primary/secondary charts.
 */
import {
  ensurePeData,
  buildImLinkedPricePath,
  runPlantEconomics,
  computeEquitySensitivity,
  computeEquityNpvGrid,
  excelModelYears,
  PE_DEFAULTS
} from "./plantEconomicsEngine.js?v=20260920v17b";

var lastResult = null;
var lastPricePath = null;
var lastInputs = null;
var lastSens = null;
var selectedCfYear = null;
var recalcTimer = null;

function $(id) {
  return document.getElementById(id);
}

function PT() {
  return window.PlotlyTheme;
}

function colors() {
  var c = (PT() && PT().colors) || {};
  return {
    text: c.text || "#111827",
    secondary: c.secondary || "#6B7280",
    grey: c.grey || "#9CA3AF",
    muted: c.muted || "#D1D5DB",
    blue: c.blue || "#1D4ED8",
    red: c.red || "#DC2626",
    green: c.green || "#16A34A",
    border: c.border || "#E5E7EB"
  };
}

function layout(extra) {
  var theme = PT();
  var base = theme && theme.cartesianLayout
    ? theme.cartesianLayout({
        margin: { t: 24, r: 12, b: 40, l: 44 },
        height: 260,
        showlegend: true
      })
    : {
        margin: { t: 24, r: 12, b: 40, l: 44 },
        height: 260,
        paper_bgcolor: "#FFFFFF",
        plot_bgcolor: "#FFFFFF",
        showlegend: true,
        legend: { orientation: "h", y: 1.12, x: 0 }
      };
  if (!extra) return base;
  return theme && theme.extend
    ? theme.extend({}, base, extra)
    : Object.assign({}, base, extra);
}

function plot(el, traces, lay) {
  if (!el || typeof Plotly === "undefined") return;
  var theme = PT();
  if (theme && theme.newPlot) {
    theme.newPlot(el, traces, lay, { displayModeBar: false, responsive: true });
  } else {
    Plotly.newPlot(el, traces, lay, { displayModeBar: false, responsive: true });
  }
}

function line(name, x, y, color, dash) {
  return {
    x: x,
    y: y,
    type: "scatter",
    mode: "lines",
    name: name,
    line: {
      width: dash ? 1.5 : 1.75,
      color: color,
      dash: dash || "solid",
      shape: "linear"
    },
    hovertemplate: "%{y}<extra>%{fullData.name}</extra>"
  };
}

function bar(name, x, y, color, opts) {
  var theme = PT();
  opts = opts || {};
  if (theme && theme.barTrace) {
    return theme.barTrace(x, y, { name: name, color: color, extra: opts });
  }
  return Object.assign(
    {
      x: x,
      y: y,
      type: "bar",
      name: name,
      marker: { color: color }
    },
    opts
  );
}

function num(id, fallback) {
  var el = $(id);
  if (!el) return fallback;
  var v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function setIfEmpty(id, value) {
  var el = $(id);
  if (!el) return;
  if (el.value === "" || el.value == null) el.value = String(value);
}

function seedFormDefaults() {
  var d = PE_DEFAULTS;
  setIfEmpty("pe-capacity", d.capacityMw);
  setIfEmpty("pe-leverage", d.gearing * 100);
  setIfEmpty("pe-debt-margin", d.debtMargin * 100);
  setIfEmpty("pe-dscr-floor", d.dscrTarget);
  setIfEmpty("pe-capex", d.capexPerMw);
  setIfEmpty("pe-euribor", d.euribor * 100);
  setIfEmpty("pe-tax", d.taxRate * 100);
  setIfEmpty("pe-om", d.fixedOmPerMw / 1000); // UI: €/kW-yr
  setIfEmpty("pe-var-om", d.variableOmPerMwh);
  setIfEmpty("pe-availability", d.availability * 100);
  setIfEmpty("pe-tenor", d.tenorYears);
  setIfEmpty("pe-target-return", d.costOfEquity * 100);
  setIfEmpty("pe-efficiency", d.nameplateEfficiency * 100);
  setIfEmpty("pe-degradation", d.degradationRate * 100);
  setIfEmpty("pe-overhaul-cost", d.overhaulCost);
  setIfEmpty("pe-overhaul-interval", d.overhaulIntervalYears);
  setIfEmpty("pe-useful-life", d.usefulLifeYears);
  setIfEmpty("pe-cod-year", d.codYear);
}

/** Ass.!D13 toggle — Under construction (1) / Already operating (0). */
function setConstructionUI(flag) {
  var v = Number(flag) === 0 ? 0 : 1;
  var hidden = $("pe-construction");
  if (hidden) hidden.value = String(v);
  var buttons = document.querySelectorAll(".pe-construction-btn");
  for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    var on = Number(btn.getAttribute("data-construction")) === v;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  }
}

function readFormInputs() {
  var fixedOmKw = num("pe-om", PE_DEFAULTS.fixedOmPerMw / 1000);
  var codYear = Math.round(num("pe-cod-year", PE_DEFAULTS.codYear));
  var constructionEl = $("pe-construction");
  var construction =
    constructionEl && constructionEl.value !== ""
      ? Number(constructionEl.value)
      : PE_DEFAULTS.construction == null
        ? 1
        : Number(PE_DEFAULTS.construction);
  return {
    capacityMw: num("pe-capacity", PE_DEFAULTS.capacityMw),
    gearing: num("pe-leverage", PE_DEFAULTS.gearing * 100) / 100,
    debtMargin: num("pe-debt-margin", PE_DEFAULTS.debtMargin * 100) / 100,
    dscrTarget: num("pe-dscr-floor", PE_DEFAULTS.dscrTarget),
    icrTarget: PE_DEFAULTS.icrTarget,
    capexPerMw: num("pe-capex", PE_DEFAULTS.capexPerMw),
    euribor: num("pe-euribor", PE_DEFAULTS.euribor * 100) / 100,
    taxRate: num("pe-tax", PE_DEFAULTS.taxRate * 100) / 100,
    fixedOmPerMw: fixedOmKw * 1000,
    variableOmPerMwh: num("pe-var-om", PE_DEFAULTS.variableOmPerMwh),
    availability: num("pe-availability", PE_DEFAULTS.availability * 100) / 100,
    tenorYears: Math.round(num("pe-tenor", PE_DEFAULTS.tenorYears)),
    costOfEquity: num("pe-target-return", PE_DEFAULTS.costOfEquity * 100) / 100,
    nameplateEfficiency:
      num("pe-efficiency", PE_DEFAULTS.nameplateEfficiency * 100) / 100,
    degradationRate:
      num("pe-degradation", PE_DEFAULTS.degradationRate * 100) / 100,
    overhaulCost: num("pe-overhaul-cost", PE_DEFAULTS.overhaulCost),
    overhaulIntervalYears: Math.round(
      num("pe-overhaul-interval", PE_DEFAULTS.overhaulIntervalYears)
    ),
    usefulLifeYears: Math.round(
      num("pe-useful-life", PE_DEFAULTS.usefulLifeYears)
    ),
    codYear: codYear,
    repaymentStartYear: codYear,
    // Ass.!D9 = YEAR(EOMONTH(opsStart,12)): already-operating → 2028; under construction → engine derives from const. schedule
    degradationStartYear: construction === 0 ? 2028 : undefined,
    construction: construction === 0 ? 0 : 1
  };
}

function imStateSnapshot() {
  var s = window.IMState || {};
  return {
    year: s.year,
    solarPct: s.solarPct,
    windPct: s.windPct,
    windYear: s.windYear,
    demandScenario: s.demandScenario,
    ttfAdjustmentPct: s.ttfAdjustmentPct
  };
}

function updateScenarioLink(result) {
  var el = $("pe-scenario-link-value");
  if (!el) return;
  var s = imStateSnapshot();
  var y0 =
    result && result.series && result.series.length ? result.series[0].year : null;
  var y1 =
    result && result.series && result.series.length
      ? result.series[result.series.length - 1].year
      : null;
  var rangeTxt =
    y0 != null && y1 != null ? y0 + "–" + y1 : "2027–2060";
  var stress = Number.isFinite(s.ttfAdjustmentPct) ? s.ttfAdjustmentPct : 0;
  var stressTxt =
    Math.abs(stress) < 0.05
      ? "no gas stress"
      : (stress > 0 ? "+" : "") + stress.toFixed(1) + "% gas stress";
  el.textContent =
    "Interaction Model — live path " +
    rangeTxt +
    " from current scrubber settings · " +
    stressTxt;
}

function fmtIrr(v) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

function fmtDscr(v) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return v.toFixed(2) + "x";
}

function fmtNpvM(v) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  var m = v / 1e6;
  var sign = m < 0 ? "−" : m > 0 ? "+" : "";
  return sign + "€" + Math.abs(m).toFixed(1) + "m";
}

/**
 * Three-branch verdict matching IM headline box pattern.
 * Name whichever equity-clear condition actually fired (IRR ≥ Ke vs NPV > 0).
 */
function buildVerdict(result) {
  var covenant = result.inputs.dscrTarget;
  var ke = result.inputs.costOfEquity;
  var minDscr = result.minDscr;
  var irr = result.equityIrr;
  var npv = result.equityNpv;
  var dscrBreached = minDscr != null && Number.isFinite(minDscr) && minDscr < covenant;
  var dscrMet = minDscr != null && Number.isFinite(minDscr) && minDscr >= covenant;
  var irrClears = irr != null && Number.isFinite(irr) && irr >= ke;
  var npvPositive = npv != null && Number.isFinite(npv) && npv > 0;
  var clearsCapital = irrClears || npvPositive;

  function irrVsKe() {
    return (
      (irr * 100).toFixed(1) +
      "% vs " +
      (ke * 100).toFixed(1) +
      "% Ke"
    );
  }

  function equityClearsSentence() {
    if (irrClears) {
      return "Equity clears its cost of capital (IRR " + irrVsKe() + ")";
    }
    if (npvPositive) {
      var irrBit =
        irr != null && Number.isFinite(irr)
          ? " even though IRR sits below cost of capital (" + irrVsKe() + ")"
          : "";
      return "Equity NPV is positive (" + fmtNpvM(npv) + ")" + irrBit;
    }
    return "Equity clears its cost of capital";
  }

  var sentence;
  if (dscrBreached) {
    var equityBit =
      irr == null || !Number.isFinite(irr)
        ? "never recovers its capital"
        : "falls short of its cost of capital";
    sentence =
      "Not bankable at current terms — DSCR runs " +
      minDscr.toFixed(2) +
      "x against a " +
      covenant.toFixed(2) +
      "x covenant, equity " +
      equityBit +
      ".";
  } else if (dscrMet && clearsCapital) {
    if (irrClears) {
      sentence =
        "Bankable at current terms — DSCR holds above the " +
        covenant.toFixed(2) +
        "x covenant, equity earns " +
        (irr * 100).toFixed(1) +
        "% against a " +
        (ke * 100).toFixed(1) +
        "% cost of capital.";
    } else {
      sentence =
        "Bankable at current terms — DSCR holds above the " +
        covenant.toFixed(2) +
        "x covenant, and " +
        equityClearsSentence() +
        ".";
    }
  } else if (dscrMet && npv <= 0) {
    sentence =
      "Meets its covenant but doesn’t clear its cost of capital — DSCR holds above " +
      covenant.toFixed(2) +
      "x, but Equity NPV is " +
      fmtNpvM(npv) +
      ".";
  } else {
    // DSCR n/a (e.g. no debt-service years) — fall back on equity only
    if (clearsCapital) {
      sentence =
        equityClearsSentence() +
        "; DSCR not applicable under current debt schedule.";
    } else {
      sentence =
        "Equity does not clear its cost of capital (NPV " +
        fmtNpvM(npv) +
        "); DSCR not applicable under current debt schedule.";
    }
  }

  var irrCaption =
    irr != null && Number.isFinite(irr)
      ? "IRR " + (irr * 100).toFixed(1) + "%"
      : "IRR undefined (cash flow never turns net positive)";
  var cum = result.cumulativeEquityCf;
  var winEnd = result.cumWindowEnd != null ? result.cumWindowEnd : result.crossoverYear;
  var cumCaption =
    cum != null && Number.isFinite(cum) && winEnd != null
      ? "Cum. equity CF through " + winEnd + " " + fmtNpvM(cum)
      : null;
  var caption =
    "Equity NPV " +
    fmtNpvM(npv) +
    " · " +
    irrCaption +
    (cumCaption ? " · " + cumCaption : "") +
    " · detail in the charts below";

  var amort = result.amortization;
  var hasDebt =
    result.construction &&
    result.construction.debtAtCod != null &&
    result.construction.debtAtCod > 1;
  if (hasDebt && amort && amort.effectivelyBullet) {
    var pos = amort.positiveScheduledYears;
    var total = amort.nonBalloonYears;
    var balloonVal = fmtNpvM(amort.balloonPrincipal);
    sentence = sentence.replace(/\.\s*$/, "");
    sentence +=
      ", and debt service is a bullet in practice, not an amortizing schedule: " +
      pos +
      " of " +
      total +
      " years carry any scheduled principal, with the rest deferred to a single " +
      balloonVal +
      " repayment at maturity.";
  }

  return { sentence: sentence, caption: caption, branch: dscrBreached ? 1 : dscrMet && clearsCapital ? 2 : dscrMet ? 3 : 0 };
}

function updateHeadline(result) {
  var textEl = $("pe-verdict-text");
  var noteEl = $("pe-verdict-note");
  if (!result) return;

  if (textEl && noteEl) {
    var v = buildVerdict(result);
    textEl.textContent = v.sentence;
    noteEl.textContent = v.caption;
  }
}

function toEurM(arr) {
  return arr.map(function (v) {
    return v / 1e6;
  });
}

/** Y-axis range that keeps a covenant marker visible alongside series values. */
function axisRangeIncluding(values, marker) {
  var nums = [];
  (values || []).forEach(function (v) {
    if (v != null && Number.isFinite(v)) nums.push(v);
  });
  if (marker != null && Number.isFinite(marker)) nums.push(marker);
  if (!nums.length) return undefined;
  var lo = Math.min.apply(null, nums);
  var hi = Math.max.apply(null, nums);
  var pad = Math.max(0.2, (hi - lo) * 0.1);
  return [lo - pad, hi + pad];
}

/**
 * Dual-axis companion range for a €m series (e.g. EBITDA).
 * Always includes 0 and pads from the true min/max so a nearly-flat
 * deeply-negative path does not autorange into a misleading 6-unit zoom.
 */
function axisRangeWithZero(values) {
  var nums = [];
  (values || []).forEach(function (v) {
    if (v != null && Number.isFinite(v)) nums.push(v);
  });
  if (!nums.length) return undefined;
  var lo = Math.min.apply(null, nums);
  var hi = Math.max.apply(null, nums);
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  var span = hi - lo;
  var mag = Math.max(Math.abs(lo), Math.abs(hi), 1);
  var pad = Math.max(span * 0.08, mag * 0.04, 1);
  return [lo - pad, hi + pad];
}

function renderPrimaryCharts(result) {
  var C = colors();
  var x = result.charts.years;
  var ebitdaM = toEurM(result.charts.ebitda);
  var sparkY = result.charts.srmcGapEurMwh || result.charts.sparkSpreadEurMwh || [];
  var dscrY = result.charts.dscr.map(function (v) {
    return v == null ? null : v;
  });
  var dscrFloor = result.inputs.dscrTarget;
  var dscrCovenant = x.map(function () {
    return dscrFloor;
  });

  plot(
    $("pe-chart-spark"),
    [
      {
        x: x,
        y: sparkY,
        type: "scatter",
        mode: "lines",
        name: "SRMC gap (€/MWh)",
        fill: "tozeroy",
        fillcolor: "rgba(107, 114, 128, 0.12)",
        line: { width: 1.75, color: C.text, shape: "linear" },
        hovertemplate: "€%{y:.1f}/MWh<extra>%{fullData.name}</extra>"
      }
    ],
    layout({
      showlegend: false,
      margin: { t: 16, r: 12, b: 40, l: 48 },
      yaxis: {
        title: { text: "€/MWh" },
        zeroline: true,
        zerolinewidth: 1.25,
        zerolinecolor: C.text
      }
    })
  );

  plot(
    $("pe-chart-revenue"),
    [
      Object.assign(
        line("Revenue (€m)", x, toEurM(result.charts.revenue), C.text),
        { hovertemplate: "€%{y:.1f}m<extra>%{fullData.name}</extra>" }
      ),
      Object.assign(
        line("EBITDA (€m)", x, ebitdaM, C.secondary),
        {
          yaxis: "y2",
          hovertemplate: "€%{y:.1f}m<extra>%{fullData.name}</extra>"
        }
      )
    ],
    layout({
      showlegend: true,
      legend: { orientation: "h", y: 1.18, x: 0 },
      margin: { t: 36, r: 52, b: 40, l: 48 },
      yaxis: { title: { text: "Revenue €m" }, rangemode: "tozero" },
      yaxis2: {
        title: { text: "EBITDA €m" },
        overlaying: "y",
        side: "right",
        showgrid: false,
        autorange: false,
        range: axisRangeWithZero(ebitdaM)
      }
    })
  );

  plot(
    $("pe-chart-dscr"),
    [
      Object.assign(line("DSCR (x)", x, dscrY, C.text), {
        connectgaps: false,
        hovertemplate: "%{y:.2f}x<extra>%{fullData.name}</extra>"
      }),
      Object.assign(
        line(
          "DSCR floor (" + dscrFloor.toFixed(2) + "x)",
          x,
          dscrCovenant,
          C.red,
          "dash"
        ),
        { hovertemplate: "%{y:.2f}x<extra>%{fullData.name}</extra>" }
      )
    ],
    layout({
      showlegend: true,
      legend: { orientation: "h", y: 1.16, x: 0 },
      margin: { t: 36, r: 12, b: 40, l: 48 },
      // Do NOT use rangemode:"tozero" here — with deeply negative DSCR the
      // 1.20x floor sits above 0 and gets clipped out of view.
      yaxis: {
        title: { text: "x" },
        range: axisRangeIncluding(dscrY, dscrFloor)
      }
    })
  );

  plot(
    $("pe-chart-debt"),
    [
      Object.assign(
        line("EoP debt (€m)", x, toEurM(result.charts.debtBalance), C.text),
        { hovertemplate: "€%{y:.1f}m<extra>%{fullData.name}</extra>" }
      )
    ],
    layout({
      showlegend: false,
      yaxis: { title: { text: "€m" }, rangemode: "tozero" }
    })
  );

  updateDebtAmortNote(result);
}

function updateDebtAmortNote(result) {
  var noteEl = $("pe-debt-note");
  if (!noteEl || !result || !result.amortization) return;
  var a = result.amortization;
  var n = a.zeroScheduledYears;
  var m = a.nonBalloonYears;
  if (a.effectivelyBullet) {
    noteEl.textContent =
      "Effectively a bullet — " +
      n +
      " of " +
      m +
      " pre-balloon years have zero scheduled amortization; 100% of principal waits on the terminal year.";
  } else if (n > 0) {
    noteEl.textContent =
      n +
      " of " +
      m +
      " pre-balloon years have zero scheduled amortization (sculpting floors at 0 when CFADS cannot clear interest × DSCR).";
  } else {
    noteEl.textContent =
      "Scheduled amortization runs in all " +
      m +
      " pre-balloon years (sculpted to the DSCR floor).";
  }
}

function renderOpexChart(result) {
  var C = colors();
  var x = result.charts.years;
  plot(
    $("pe-chart-opex"),
    [
      bar("Fuel", x, toEurM(result.charts.fuelCost), C.text),
      bar("Variable O&M", x, toEurM(result.charts.variableOm), C.secondary),
      bar("Fixed O&M", x, toEurM(result.charts.fixedOm), C.muted)
    ],
    layout({
      barmode: "stack",
      legend: { orientation: "h", y: 1.14, x: 0 },
      margin: { t: 36, r: 12, b: 40, l: 48 },
      yaxis: { title: { text: "€m" }, rangemode: "tozero" }
    })
  );
}

function renderIcrChart(result) {
  var C = colors();
  var x = result.charts.years;
  var icrY = result.charts.icr.map(function (v) {
    return v == null ? null : v;
  });
  var icrFloor = result.inputs.icrTarget;
  var icrCovenant = x.map(function () {
    return icrFloor;
  });
  plot(
    $("pe-chart-icr"),
    [
      Object.assign(line("ICR (x)", x, icrY, C.text), {
        connectgaps: false,
        hovertemplate: "%{y:.2f}x<extra>%{fullData.name}</extra>"
      }),
      Object.assign(
        line(
          "ICR covenant (" + icrFloor.toFixed(1) + "x)",
          x,
          icrCovenant,
          C.red,
          "dash"
        ),
        { hovertemplate: "%{y:.2f}x<extra>%{fullData.name}</extra>" }
      )
    ],
    layout({
      showlegend: true,
      legend: { orientation: "h", y: 1.16, x: 0 },
      margin: { t: 36, r: 12, b: 40, l: 48 },
      yaxis: {
        title: { text: "x" },
        range: axisRangeIncluding(icrY, icrFloor)
      }
    })
  );
}

function renderBalanceSheetChart(result) {
  var C = colors();
  var x = result.charts.years;
  plot(
    $("pe-chart-bs"),
    [
      Object.assign(
        line(
          "Assets (net PPE)",
          x,
          toEurM(result.charts.assetsNetPpe),
          C.text
        ),
        { hovertemplate: "€%{y:.1f}m<extra>%{fullData.name}</extra>" }
      ),
      Object.assign(
        line(
          "Liabilities (EoP debt)",
          x,
          toEurM(result.charts.debtBalance),
          C.secondary
        ),
        { hovertemplate: "€%{y:.1f}m<extra>%{fullData.name}</extra>" }
      )
    ],
    layout({
      legend: { orientation: "h", y: 1.14, x: 0 },
      margin: { t: 36, r: 12, b: 40, l: 48 },
      yaxis: { title: { text: "€m" }, rangemode: "tozero" }
    })
  );
}

function syncCfYearSelect(result) {
  var sel = $("pe-cf-year");
  if (!sel || !result || !result.series.length) return;
  var years = result.series.map(function (r) {
    return r.year;
  });
  if (
    selectedCfYear == null ||
    years.indexOf(selectedCfYear) < 0
  ) {
    selectedCfYear = years[0];
  }
  var html = years
    .map(function (y) {
      return (
        "<option value=\"" +
        y +
        "\"" +
        (y === selectedCfYear ? " selected" : "") +
        ">" +
        y +
        "</option>"
      );
    })
    .join("");
  sel.innerHTML = html;
}

function ebitdaContextNote(result, year) {
  var vals = result.series.map(function (r) {
    return r.ebitda;
  });
  var minV = Math.min.apply(null, vals);
  var maxV = Math.max.apply(null, vals);
  var row = result.series.find(function (r) {
    return r.year === year;
  });
  if (!row) return "";
  var allNeg = maxV < 0;
  var isCod = year === result.series[0].year;
  var isWorst = row.ebitda === minV;
  var isBest = row.ebitda === maxV;
  var parts = [];
  if (allNeg) {
    parts.push("EBITDA negative every year under live IM path");
  }
  if (isCod && isBest && !isWorst) {
    parts.push(
      "COD is the least-bad year (not the worst) — costs still dominate"
    );
  } else if (isWorst) {
    parts.push("selected year is the worst EBITDA year");
  }
  return parts.join(" · ");
}

function renderWaterfallChart(result) {
  var C = colors();
  syncCfYearSelect(result);
  var year = selectedCfYear != null ? selectedCfYear : result.series[0].year;
  var row = result.series.find(function (r) {
    return r.year === year;
  });
  if (!row) row = result.series[0];

  var noteEl = $("pe-cf-note");
  if (noteEl) noteEl.textContent = ebitdaContextNote(result, row.year);

  var rev = row.revenue / 1e6;
  var fuel = row.fuelCost / 1e6;
  var om = row.opex / 1e6;
  var tax = row.tax / 1e6;
  var debtSvc = row.debtService / 1e6;
  var equity = row.equityCashFlow / 1e6;

  // Native waterfall: relative steps, then Equity CF as measure:"total"
  // (bar from zero = cumulative result, not another relative cascade step).
  var labels = ["Revenue", "Fuel", "O&M", "Tax", "Debt service", "Equity CF"];
  var values = [rev, -fuel, -om, -tax, -debtSvc, equity];
  plot(
    $("pe-chart-waterfall"),
    [
      {
        type: "waterfall",
        name: "Cash flow",
        x: labels,
        y: values,
        measure: [
          "relative",
          "relative",
          "relative",
          "relative",
          "relative",
          "total"
        ],
        connector: { line: { color: C.muted, width: 1, dash: "dot" } },
        increasing: { marker: { color: C.green } },
        decreasing: { marker: { color: C.red } },
        totals: {
          marker: {
            color: equity >= 0 ? C.green : C.text,
            line: { width: 1.5, color: C.text }
          }
        },
        text: values.map(function (v, i) {
          if (i === values.length - 1) return "€" + equity.toFixed(1) + "m";
          return "€" + v.toFixed(1) + "m";
        }),
        textposition: "outside",
        hovertemplate: "%{x}: €%{y:.1f}m<extra></extra>"
      }
    ],
    layout({
      showlegend: false,
      margin: { t: 16, r: 12, b: 48, l: 48 },
      yaxis: { title: { text: "€m" }, zeroline: true, zerolinewidth: 1 },
      xaxis: { type: "category", tickangle: -20 },
      waterfallgap: 0.25
    })
  );
}

function fmtSensMetric(metric, value) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (metric === "irr") return (value * 100).toFixed(1) + "%";
  return "€" + (value / 1e6).toFixed(1) + "m";
}

function renderTornadoChart(inputs, pricePath) {
  var C = colors();
  var sens = computeEquitySensitivity(inputs, pricePath, 0.2);
  lastSens = sens;
  var noteEl = $("pe-irr-note");
  if (noteEl) {
    noteEl.textContent =
      sens.metric === "irr"
        ? "±20% shocks vs the current case (Equity IRR)."
        : "IRR n/a under current case — showing Equity NPV (±20% shocks).";
  }

  var labels = sens.rows.map(function (r) {
    return r.label;
  });
  var lowX = sens.rows.map(function (r) {
    if (r.deltaLow == null) return 0;
    return sens.metric === "irr" ? r.deltaLow * 100 : r.deltaLow / 1e6;
  });
  var highX = sens.rows.map(function (r) {
    if (r.deltaHigh == null) return 0;
    return sens.metric === "irr" ? r.deltaHigh * 100 : r.deltaHigh / 1e6;
  });
  var lowText = sens.rows.map(function (r) {
    return fmtSensMetric(sens.metric, r.low);
  });
  var highText = sens.rows.map(function (r) {
    return fmtSensMetric(sens.metric, r.high);
  });
  var axisTitle =
    sens.metric === "irr" ? "Δ Equity IRR (pp)" : "Δ Equity NPV (€m)";

  plot(
    $("pe-chart-irr"),
    [
      {
        type: "bar",
        orientation: "h",
        name: "−20%",
        y: labels,
        x: lowX,
        text: lowText,
        textposition: "outside",
        cliponaxis: false,
        textfont: { size: 10, color: C.text },
        marker: { color: C.red },
        hovertemplate: "%{text}<extra>−20%</extra>"
      },
      {
        type: "bar",
        orientation: "h",
        name: "+20%",
        y: labels,
        x: highX,
        text: highText,
        textposition: "outside",
        cliponaxis: false,
        textfont: { size: 10, color: C.text },
        marker: { color: C.green },
        hovertemplate: "%{text}<extra>+20%</extra>"
      }
    ],
    layout({
      barmode: "overlay",
      showlegend: true,
      legend: {
        orientation: "h",
        y: 1.02,
        yanchor: "bottom",
        x: 0,
        bgcolor: "rgba(255,255,255,0.9)"
      },
      margin: { t: 28, r: 72, b: 36, l: 88 },
      xaxis: { title: { text: axisTitle }, zeroline: true, zerolinewidth: 1 },
      yaxis: { automargin: true, autorange: "reversed" }
    })
  );
}

function luminance(hex) {
  var h = (hex || "").replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return 1;
  var r = parseInt(h.slice(0, 2), 16) / 255;
  var g = parseInt(h.slice(2, 4), 16) / 255;
  var b = parseInt(h.slice(4, 6), 16) / 255;
  var toLin = function (c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function hexLerp(a, b, t) {
  function parse(h) {
    h = h.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }
  var A = parse(a);
  var B = parse(b);
  var out = A.map(function (v, i) {
    return Math.round(v + (B[i] - v) * t);
  });
  return (
    "#" +
    out
      .map(function (v) {
        return ("0" + v.toString(16)).slice(-2);
      })
      .join("")
  );
}

function npvGridCellColors(minV, maxV) {
  var crossesZero = minV < 0 && maxV > 0;
  return {
    crossesZero: crossesZero,
    bgFor: function (v) {
      if (!Number.isFinite(v)) return "#F9FAFB";
      if (crossesZero) {
        var span = Math.max(Math.abs(minV), Math.abs(maxV), 1);
        if (v >= 0) {
          return hexLerp("#FFFFFF", "#16A34A", Math.min(1, v / span));
        }
        return hexLerp("#FFFFFF", "#DC2626", Math.min(1, Math.abs(v) / span));
      }
      // Single-hue intensity: darkest at most extreme (farthest from zero /
      // most negative when all-negative), pale near the least-extreme.
      var lo = minV;
      var hi = maxV;
      var t = hi === lo ? 0.5 : (v - lo) / (hi - lo); // 0 = most neg, 1 = least neg
      // Intensity: 1 at most negative, 0 at least negative
      var intensity = 1 - t;
      if (hi <= 0) {
        return hexLerp("#FFFFFF", "#991B1B", 0.15 + 0.85 * intensity);
      }
      if (lo >= 0) {
        return hexLerp("#FFFFFF", "#166534", 0.15 + 0.85 * intensity);
      }
      return hexLerp("#FFFFFF", "#6B7280", 0.15 + 0.85 * intensity);
    },
    fgFor: function (bg) {
      // Prefer light text once background is mid-dark so €m figures stay legible.
      return luminance(bg) < 0.55 ? "#FFFFFF" : "#111827";
    }
  };
}

function renderNpvGrid(inputs, pricePath) {
  var table = $("pe-npv-grid");
  if (!table) return;
  var grid = computeEquityNpvGrid(inputs, pricePath);
  var midR = Math.floor(grid.elecShocks.length / 2);
  var midC = Math.floor(grid.capexShocks.length / 2);
  var flat = [];
  grid.matrix.forEach(function (row) {
    row.forEach(function (v) {
      if (Number.isFinite(v)) flat.push(v);
    });
  });
  var minV = flat.length ? Math.min.apply(null, flat) : 0;
  var maxV = flat.length ? Math.max.apply(null, flat) : 0;
  var scale = npvGridCellColors(minV, maxV);

  var head =
    "<thead><tr><th>Elec \\ Capex</th>" +
    grid.colLabels
      .map(function (c) {
        return "<th>" + c + "</th>";
      })
      .join("") +
    "</tr></thead>";
  var body = grid.matrix
    .map(function (row, ri) {
      var cells = row
        .map(function (v, ci) {
          var bg = scale.bgFor(v);
          var fg = scale.fgFor(bg);
          var cls = ri === midR && ci === midC ? "pe-npv-center" : "";
          return (
            "<td class=\"" +
            cls +
            "\" style=\"background-color:" +
            bg +
            ";color:" +
            fg +
            "\">" +
            (v / 1e6).toFixed(0) +
            "</td>"
          );
        })
        .join("");
      return "<tr><th>" + grid.rowLabels[ri] + "</th>" + cells + "</tr>";
    })
    .join("");
  table.innerHTML = head + "<tbody>" + body + "</tbody>";
}

function renderSecondaryCharts(result, inputs, pricePath) {
  renderOpexChart(result);
  renderIcrChart(result);
  renderBalanceSheetChart(result);
  renderWaterfallChart(result);
  renderTornadoChart(inputs, pricePath);
  renderNpvGrid(inputs, pricePath);
}

function renderRevenueMiniFromResult(el, result) {
  if (!el || !result) return;
  var C = colors();
  var x = result.charts.years;
  var ebitdaM = toEurM(result.charts.ebitda);
  plot(
    el,
    [
      Object.assign(
        line("Revenue (€m)", x, toEurM(result.charts.revenue), C.text),
        { hoverinfo: "skip" }
      ),
      Object.assign(
        line("EBITDA (€m)", x, ebitdaM, C.secondary),
        { yaxis: "y2", hoverinfo: "skip" }
      )
    ],
    layout({
      showlegend: false,
      height: 120,
      margin: { t: 10, r: 36, b: 22, l: 32 },
      yaxis: { title: { text: "" }, rangemode: "tozero", tickfont: { size: 9 } },
      yaxis2: {
        title: { text: "" },
        overlaying: "y",
        side: "right",
        showgrid: false,
        tickfont: { size: 9 },
        autorange: false,
        range: axisRangeWithZero(ebitdaM)
      },
      xaxis: { tickfont: { size: 9 } }
    })
  );
}

function applyAllBadges() {
  if (!window.ChartData || !window.ChartData.applyAuditBadge) return;
  var cards = [
    ["pe-spark", "#pe-card-spark"],
    ["pe-revenue", "#pe-card-revenue"],
    ["pe-dscr", "#pe-card-dscr"],
    ["pe-debt", "#pe-card-debt"],
    ["pe-waterfall", "#pe-card-waterfall"],
    ["pe-irr", "#pe-card-irr"],
    ["pe-opex", "#pe-card-opex"],
    ["pe-icr", "#pe-card-icr"],
    ["pe-bs", "#pe-card-bs"],
    ["pe-npv-grid", "#pe-card-npv-grid"]
  ];
  cards.forEach(function (row) {
    window.ChartData.applyAuditBadge(row[0], row[1], "overlay");
  });
}

async function recalculate() {
  seedFormDefaults();
  var inputs = readFormInputs();
  // Excel v11 horizon: Ops.!J5:AQ = 2027–2060 (construction + ops), not COD-only.
  var years = excelModelYears(inputs);
  try {
    var data = await ensurePeData("./im_data/");
    var im = imStateSnapshot();
    var pricePath = buildImLinkedPricePath(data, im, years);
    // Excel Ass.!D41 CO₂; repayment start = Ass.!D23 (UI COD); degradation start from readFormInputs / engine
    inputs = Object.assign({}, inputs, {
      co2PerGasMwh: 0.20196,
      repaymentStartYear: inputs.codYear
    });
    if (inputs.degradationStartYear == null) {
      delete inputs.degradationStartYear; // let mergeInputs derive from Ass.!D9 logic
    }
    var result = runPlantEconomics(inputs, pricePath);
    lastResult = result;
    lastPricePath = pricePath;
    lastInputs = inputs;
    updateScenarioLink(result);
    updateHeadline(result);
    renderPrimaryCharts(result);
    renderSecondaryCharts(result, inputs, pricePath);
    applyAllBadges();
    var mini = $("dash-preview-fin");
    if (mini) renderRevenueMiniFromResult(mini, result);
  } catch (err) {
    var textEl = $("pe-verdict-text");
    var noteEl = $("pe-verdict-note");
    if (textEl) {
      textEl.textContent =
        "Calculation error: " + (err && err.message ? err.message : String(err));
    }
    if (noteEl) noteEl.textContent = "";
    console.error("[Plant Economics]", err);
  }
}

function scheduleRecalc() {
  if (recalcTimer) clearTimeout(recalcTimer);
  recalcTimer = setTimeout(function () {
    recalcTimer = null;
    recalculate();
  }, 80);
}

function bindForm() {
  var form = $("pe-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      scheduleRecalc();
    });
    form.addEventListener("input", scheduleRecalc);
    form.addEventListener("change", scheduleRecalc);
  }
  var constrBtns = document.querySelectorAll(".pe-construction-btn");
  for (var ci = 0; ci < constrBtns.length; ci++) {
    constrBtns[ci].addEventListener("click", function (ev) {
      var btn = ev.currentTarget;
      var flag = Number(btn.getAttribute("data-construction")) === 0 ? 0 : 1;
      setConstructionUI(flag);
      // Canonical Base-case O&M (Ass.!O21/O22 → €12/kW-yr, €1.5/MWh) for both D11 states
      var om = $("pe-om");
      var vom = $("pe-var-om");
      if (om) om.value = "12";
      if (vom) vom.value = "1.5";
      var deg = $("pe-degradation");
      if (deg && flag === 0) deg.value = "0.25";
      scheduleRecalc();
    });
  }
  var cfYear = $("pe-cf-year");
  if (cfYear) {
    cfYear.addEventListener("change", function () {
      var y = parseInt(cfYear.value, 10);
      if (!Number.isFinite(y)) return;
      selectedCfYear = y;
      if (lastResult) renderWaterfallChart(lastResult);
    });
  }
  var btn = $("pe-advanced-toggle");
  var panel = $("pe-advanced");
  if (btn && panel) {
    btn.addEventListener("click", function () {
      var open = panel.hasAttribute("hidden");
      if (open) {
        panel.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "Customize further ▾";
      } else {
        panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "Customize further ▸";
      }
    });
  }
  var methodBtn = $("pe-method-toggle");
  var methodBody = $("pe-method-body");
  if (methodBtn && methodBody) {
    methodBtn.addEventListener("click", function () {
      var open = methodBody.hidden;
      methodBody.hidden = !open;
      methodBtn.setAttribute("aria-expanded", open ? "true" : "false");
      methodBtn.textContent = open
        ? "Hide full methodology ▾"
        : "Show full methodology ▸";
    });
  }
}

function onTab(tabId) {
  if (tabId !== "plant-economics") return;
  requestAnimationFrame(function () {
    recalculate().then(function () {
      if (typeof Plotly === "undefined") return;
      [
        "pe-chart-spark",
        "pe-chart-revenue",
        "pe-chart-dscr",
        "pe-chart-debt",
        "pe-chart-waterfall",
        "pe-chart-irr",
        "pe-chart-opex",
        "pe-chart-icr",
        "pe-chart-bs"
      ].forEach(function (id) {
        var el = $(id);
        if (el && el.data) {
          try {
            Plotly.Plots.resize(el);
          } catch (e) {
            /* ignore */
          }
        }
      });
    });
  });
}

function boot() {
  seedFormDefaults();
  setConstructionUI(
    PE_DEFAULTS.construction == null ? 1 : Number(PE_DEFAULTS.construction)
  );
  bindForm();
  window.__onTabActivated = window.__onTabActivated || [];
  window.__onTabActivated.push(onTab);

  window.__peRenderRevenueMini = function (el) {
    if (!el) return;
    var run = function () {
      if (lastResult) {
        renderRevenueMiniFromResult(el, lastResult);
        return;
      }
      recalculate().then(function () {
        if (lastResult) renderRevenueMiniFromResult(el, lastResult);
      });
    };
    if (window.__whenPlotlyReady) window.__whenPlotlyReady(run);
    else run();
  };

  window.__peRecalculate = scheduleRecalc;

  if (document.querySelector("#panel-plant-economics")) {
    setTimeout(scheduleRecalc, 400);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
