/**
 * Takeaways deck — presentation chrome + restored chart layouts
 * (TTF + supporting visuals, PE revenue/DSCR, Scen. grid).
 */
import {
  ensurePeData,
  buildImLinkedPricePath,
  runPlantEconomics,
  PE_DEFAULTS,
  excelModelYears,
  computeScenSensiGrid
} from "./plantEconomicsEngine.js?v=20260920v17slides";
import {
  computeAnnualStateAggregate,
  eegCapacityAt,
  emberCaps2025
} from "./im_engine/scenarioEngine.js?v=20260920v17";

var C = {
  blue: "#1D4ED8",
  orange: "#EA580C",
  green: "#16A34A",
  red: "#DC2626",
  text: "#111827",
  muted: "#6B7280",
  grey: "#9CA3AF",
  border: "#E5E7EB",
  g2: "#374151"
};

var EIA_FALLBACK = {
  destinations: ["Europe", "Asia", "LatAm", "Other"],
  mt: [73.8, 28.0, 12.0, 8.0]
};

function $(id) {
  return document.getElementById(id);
}

function plotCfg() {
  return { staticPlot: true, displayModeBar: false, responsive: true };
}

function layoutBase(extra) {
  var PT = window.PlotlyTheme;
  var base = {
    margin: { t: 18, r: 14, b: 34, l: 42 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, sans-serif", size: 11, color: C.text }
  };
  var merged = Object.assign(base, extra || {});
  if (PT && typeof PT.normalizeLayout === "function") {
    return PT.normalizeLayout(merged, "cartesian");
  }
  return merged;
}

function plot(el, traces, lay) {
  if (!el || typeof Plotly === "undefined") return Promise.resolve();
  var PT = window.PlotlyTheme;
  if (PT && typeof PT.newPlot === "function") {
    return PT.newPlot(el, traces, layoutBase(lay), plotCfg(), "cartesian");
  }
  return Plotly.newPlot(el, traces, layoutBase(lay), plotCfg());
}

function fmtM(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  var sign = v < 0 ? "−" : "+";
  return sign + "€" + (Math.abs(v) / 1e6).toFixed(1) + "m";
}

function fmtPp(a, b) {
  var d = (b - a) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(0) + "pp";
}

function fmtEurDelta(a, b) {
  var d = b - a;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + " €/MWh";
}

function toEurM(arr) {
  return arr.map(function (v) {
    return v == null ? null : v / 1e6;
  });
}

function axisRangeIncluding(values, marker) {
  var xs = [];
  (values || []).forEach(function (v) {
    if (v != null && Number.isFinite(v)) xs.push(v);
  });
  if (marker != null && Number.isFinite(marker)) xs.push(marker);
  if (!xs.length) return undefined;
  var lo = Math.min.apply(null, xs);
  var hi = Math.max.apply(null, xs);
  var pad = Math.max(0.05, (hi - lo) * 0.12);
  return [lo - pad, hi + pad];
}

function axisRangeWithZero(values) {
  var xs = [0];
  (values || []).forEach(function (v) {
    if (v != null && Number.isFinite(v)) xs.push(v);
  });
  var lo = Math.min.apply(null, xs);
  var hi = Math.max.apply(null, xs);
  var pad = Math.max(0.5, (hi - lo) * 0.1);
  return [lo - pad, hi + pad];
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
  return (
    "#" +
    A.map(function (v, i) {
      return Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0");
    }).join("")
  );
}

function renderMap() {
  if (typeof window.renderCombinedMap === "function") {
    window.renderCombinedMap("slide1-map", { showLegend: false });
  }
}

function firstZeroCrossYear(years, values) {
  if (!years || !values) return null;
  for (var i = 1; i < values.length; i++) {
    var a = values[i - 1];
    var b = values[i];
    if (a == null || b == null) continue;
    if (a > 0 && b <= 0) return years[i];
  }
  return null;
}

function renderMvf() {
  var CD = window.ChartData;
  var hirth = CD && CD.getHirthMvfCurves ? CD.getHirthMvfCurves() : null;
  var callouts = CD && CD.getCaptureCallouts ? CD.getCaptureCallouts() : null;
  var es = callouts && callouts.spanishSolar;

  var esX = [];
  var esY = [];
  var esText = [];
  var esColor = [];
  if (es) {
    esX.push(es.penetration, es.penetration + 1);
    esY.push(es.mvf, es.monthlyLow);
    esText.push("Spain solar " + es.year, "Spain worst month");
    esColor.push(C.blue, C.orange);
  }

  var deX = [];
  var deY = [];
  var deText = [];
  if (CD && CD.getDeMvfEmpirical) {
    (CD.getDeMvfEmpirical() || []).forEach(function (p) {
      deX.push(Math.round(p.penetration));
      deY.push(p.solar_mvf);
      deText.push("Germany solar " + p.year);
    });
  }

  plot(
    $("slide2-mvf"),
    [
      {
        x: hirth ? hirth.x : [5, 25, 45, 65],
        y: hirth ? hirth.hirth : [0.92, 0.84, 0.72, 0.55],
        type: "scatter",
        mode: "lines",
        name: "Hirth (2013) wind — comparison only",
        line: { color: C.grey, width: 2, dash: "dash" }
      },
      {
        x: deX,
        y: deY,
        type: "scatter",
        mode: "markers",
        name: "Germany solar (actual)",
        text: deText,
        marker: { size: 8, color: "#93C5FD" }
      },
      {
        x: esX,
        y: esY,
        type: "scatter",
        mode: "markers",
        name: "Spain solar (actual)",
        text: esText,
        marker: { size: 11, color: esColor }
      }
    ],
    {
      showlegend: true,
      legend: { orientation: "h", y: 1.16, x: 0, font: { size: 10 } },
      margin: { t: 36, r: 14, b: 42, l: 48 },
      xaxis: { title: { text: "Share of electricity from renewables (%)" }, range: [0, 80] },
      yaxis: { title: { text: "Share of avg. price received" }, range: [0.3, 1.05] },
      annotations: es
        ? [
            {
              x: es.penetration,
              y: es.mvf,
              text: "Spain 2025 · " + es.mvf.toFixed(2),
              showarrow: true,
              arrowhead: 0,
              ax: -40,
              ay: -28,
              font: { size: 11, color: C.blue }
            },
            {
              x: es.penetration + 1,
              y: es.monthlyLow,
              text: "Worst month · " + es.monthlyLow.toFixed(2),
              showarrow: true,
              arrowhead: 0,
              ax: 36,
              ay: 24,
              font: { size: 11, color: C.orange }
            }
          ]
        : []
    }
  );

  if (es) {
    $("slide2-mvf-stat").textContent = es.mvf.toFixed(2);
    $("slide2-mvf-sub").textContent =
      "of the average price in " +
      es.year +
      " · worst month " +
      es.monthlyLow.toFixed(2);
  }
}

function renderTtf() {
  var t =
    window.ChartData &&
    window.ChartData.getTtfForward &&
    window.ChartData.getTtfForward();
  if (!t) return;
  var floorLo = t.srmcFloor?.low_eur_mwh ?? 15;
  var floorHi = t.srmcFloor?.high_eur_mwh ?? 22;
  var traces = [
    {
      x: t.months,
      y: t.months.map(function () {
        return floorHi;
      }),
      type: "scatter",
      mode: "lines",
      line: { width: 0 },
      hoverinfo: "skip",
      showlegend: false
    },
    {
      x: t.months,
      y: t.months.map(function () {
        return floorLo;
      }),
      type: "scatter",
      mode: "lines",
      name: "Cost floor (US gas to Europe)",
      fill: "tonexty",
      fillcolor: "rgba(29,78,216,0.1)",
      line: { color: C.grey, width: 1, dash: "dot" }
    },
    {
      x: t.months,
      y: t.prices,
      type: "scatter",
      mode: "lines",
      name: "Agreed future gas price",
      line: { color: C.blue, width: 2.5 }
    }
  ];
  if (t.spot) {
    traces.push({
      x: [t.spot.date],
      y: [t.spot.price],
      type: "scatter",
      mode: "markers",
      name: "Today’s price",
      marker: { size: 9, color: C.orange }
    });
  }
  plot($("slide3-ttf"), traces, {
    showlegend: true,
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
    margin: { t: 28, r: 12, b: 32, l: 42 },
    yaxis: { title: { text: "€/MWh" }, range: [10, 60] }
  });
}

function renderLng() {
  var dest = EIA_FALLBACK.destinations;
  var mt = EIA_FALLBACK.mt;
  var euYears = [2022, 2023, 2024, 2025];
  var euMt = [120.0, 121.5, 100.1, 126.2];

  plot(
    $("slide3-dest"),
    [
      {
        x: dest,
        y: mt,
        type: "bar",
        marker: { color: [C.blue, C.g2, "#D1D5DB", "#9CA3AF"] },
        text: mt.map(function (v) {
          return v.toFixed(0);
        }),
        textposition: "outside",
        cliponaxis: false
      }
    ],
    {
      margin: { t: 10, r: 12, b: 36, l: 36 },
      showlegend: false,
      xaxis: { tickfont: { size: 10 } },
      yaxis: { title: { text: "Mt" }, rangemode: "tozero", tickfont: { size: 10 } }
    }
  );

  plot(
    $("slide3-eu"),
    [
      {
        x: euYears,
        y: euMt,
        type: "scatter",
        mode: "lines+markers",
        line: { color: C.orange, width: 2.5 },
        marker: { size: 8, color: C.orange }
      }
    ],
    {
      margin: { t: 14, r: 18, b: 32, l: 36 },
      showlegend: false,
      xaxis: { dtick: 1, tickfont: { size: 10 } },
      yaxis: { title: { text: "Mt" }, rangemode: "tozero", tickfont: { size: 10 } },
      annotations: [
        {
          x: 2025,
          y: 126.2,
          text: "126.2",
          showarrow: false,
          yshift: 12,
          font: { size: 11, color: C.orange, weight: 600 }
        }
      ]
    }
  );
}

function paintImBar(rootId, agg) {
  var root = $(rootId);
  if (!root || !agg) return;
  var segs = [
    { cls: "neg", label: "Zero / neg.", share: agg.S_neg, price: agg.P_neg },
    { cls: "res", label: "Residual", share: agg.S_res, price: agg.P_res },
    { cls: "gas", label: "Gas sets", share: agg.S_gas, price: agg.P_gas }
  ];
  root.innerHTML = segs
    .map(function (s) {
      var flex = Math.max(0.08, Number.isFinite(s.share) ? s.share : 0);
      return (
        '<div class="im-bar-seg im-bar-seg--' +
        s.cls +
        '" style="flex:' +
        flex +
        ' 1 0"><span class="l">' +
        s.label +
        '</span><span class="p">€' +
        (Number.isFinite(s.price) ? s.price.toFixed(1) : "—") +
        '</span><span class="s">' +
        (Number.isFinite(s.share) ? (s.share * 100).toFixed(0) + "%" : "—") +
        "</span></div>"
      );
    })
    .join("");
}

function renderCompound(data) {
  var caps = emberCaps2025(data);
  function aggAt(year) {
    var onTrack = eegCapacityAt(year, caps);
    return computeAnnualStateAggregate(data, {
      year: year,
      solarCapacityGW: onTrack.solar,
      windCapacityGW: onTrack.wind,
      windYearType: "base",
      demandGrowthScenario: "B",
      ttfAdjustmentPct: 0
    });
  }
  var a = aggAt(2025);
  var b = aggAt(2030);
  $("slide4-price-2025").textContent =
    "€" + Number(a.avg_price_eur_mwh).toFixed(1);
  $("slide4-price-2030").textContent =
    "€" + Number(b.avg_price_eur_mwh).toFixed(1);

  var states = ["Free / negative", "Other plants", "Gas plants"];
  var s0 = [a.S_neg, a.S_res, a.S_gas].map(function (v) {
    return v * 100;
  });
  var s1 = [b.S_neg, b.S_res, b.S_gas].map(function (v) {
    return v * 100;
  });
  plot(
    $("slide4-compare"),
    [
      {
        x: states,
        y: s0,
        name: "2025",
        type: "bar",
        marker: { color: "#93C5FD" },
        text: s0.map(function (v) {
          return v.toFixed(0) + "%";
        }),
        textposition: "outside",
        cliponaxis: false
      },
      {
        x: states,
        y: s1,
        name: "2030",
        type: "bar",
        marker: { color: C.blue },
        text: s1.map(function (v) {
          return v.toFixed(0) + "%";
        }),
        textposition: "outside",
        cliponaxis: false
      }
    ],
    {
      barmode: "group",
      bargap: 0.32,
      margin: { t: 32, r: 14, b: 36, l: 42 },
      showlegend: true,
      legend: { orientation: "h", y: 1.16, x: 0, font: { size: 11 } },
      yaxis: {
        title: { text: "% hours" },
        range: [0, Math.max.apply(null, s0.concat(s1)) * 1.35],
        tickfont: { size: 11 }
      },
      xaxis: { tickfont: { size: 11 } }
    }
  );

  $("slide4-d-price").textContent = fmtEurDelta(
    a.avg_price_eur_mwh,
    b.avg_price_eur_mwh
  );
  $("slide4-d-neg").textContent = fmtPp(a.S_neg, b.S_neg);
  $("slide4-d-gas").textContent = fmtPp(a.S_gas, b.S_gas);
}

function renderPpa() {
  var techs = ["Solar", "Onshore wind", "Offshore wind"];
  var ppa = [35, 52.75, 88];
  var breakeven = [47.5, 78, 87.5];
  var gaps = ppa.map(function (p, i) {
    return p - breakeven[i];
  });
  gaps.forEach(function (g, i) {
    var el = $("slide5-g" + i);
    if (!el) return;
    el.textContent = (g >= 0 ? "+" : "−") + "€" + Math.abs(g).toFixed(1);
    el.classList.toggle("is-neg", g < -0.5);
    el.classList.toggle("is-pos", g > 0.5);
  });
  plot(
    $("slide5-ppa"),
    [
      {
        x: techs,
        y: ppa,
        name: "What buyers pay",
        type: "bar",
        marker: { color: C.blue },
        text: ppa.map(function (v) {
          return "€" + v;
        }),
        textposition: "outside",
        cliponaxis: false
      },
      {
        x: techs,
        y: breakeven,
        name: "What builders need",
        type: "bar",
        marker: { color: C.g2 },
        text: ["€45–50", "€78", "€85–90"],
        textposition: "outside",
        cliponaxis: false
      }
    ],
    {
      barmode: "group",
      bargap: 0.28,
      showlegend: true,
      legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
      margin: { t: 28, r: 10, b: 36, l: 40 },
      yaxis: { title: { text: "€ per MWh" }, range: [0, 115] }
    }
  );
}

function renderPePair(prefix, result) {
  var x = result.charts.years;
  var ebitdaM = toEurM(result.charts.ebitda);

  plot(
    $(prefix + "-revenue"),
    [
      {
        x: x,
        y: toEurM(result.charts.revenue),
        type: "scatter",
        mode: "lines",
        name: "Revenue",
        line: { color: C.blue, width: 2.25 }
      },
      {
        x: x,
        y: ebitdaM,
        type: "scatter",
        mode: "lines",
        name: "Operating profit",
        line: { color: C.muted, width: 1.75 }
      }
    ],
    {
      showlegend: true,
      legend: { orientation: "h", y: 1.14, x: 0, font: { size: 10 } },
      margin: { t: 28, r: 16, b: 28, l: 40 },
      yaxis: {
        title: { text: "€ million", font: { size: 10 } },
        rangemode: "tozero",
        zeroline: true,
        zerolinecolor: "#9CA3AF",
        zerolinewidth: 1,
        tickfont: { size: 10 }
      },
      xaxis: { tickfont: { size: 10 }, dtick: 10 }
    }
  );
}

function fillFinancing(pe0, pe1) {
  var n0 = $("pe0-npv");
  var n1 = $("pe1-npv");
  n0.textContent = fmtM(pe0.equityNpv);
  n0.classList.toggle("is-pos", pe0.equityNpv >= 0);
  n0.classList.toggle("is-neg", pe0.equityNpv < 0);
  n1.textContent = fmtM(pe1.equityNpv);
  n1.classList.toggle("is-pos", pe1.equityNpv >= 0);
  n1.classList.toggle("is-neg", pe1.equityNpv < 0);

  $("pe0-irr").textContent =
    pe0.equityIrr != null
      ? (pe0.equityIrr * 100).toFixed(1) + "% (vs 6% Ke)"
      : "n/a";
  $("pe0-cf").textContent = "thin throughout; turns negative mid-century";

  $("pe1-cum").textContent = "nil through construction; then tracks the operating case";
  $("pe1-dscr-stat").textContent = "equally thin once online";
}

function renderSensiGrid(grid) {
  var host = $("slide7-grid");
  if (!host || !grid) return;
  var all = [];
  grid.levers.forEach(function (lev) {
    lev.values.forEach(function (v) {
      if (Number.isFinite(v)) all.push(v);
    });
  });
  var minV = Math.min.apply(null, all);
  var maxV = Math.max.apply(null, all);
  var baseV = grid.levers[0].values[grid.levers[0].baseIndex];
  if ($("slide7-base")) $("slide7-base").textContent = fmtM(baseV);

  function bgFor(v) {
    if (!Number.isFinite(v)) return "#F3F4F6";
    if (Math.abs(v - baseV) < 1) return "#FFFFFF";
    if (v >= baseV) {
      var tUp = Math.min(1, (v - baseV) / Math.max(1, maxV - baseV));
      return hexLerp("#FFFFFF", "#BBF7D0", 0.2 + 0.75 * tUp);
    }
    var tDn = Math.min(1, (baseV - v) / Math.max(1, baseV - minV));
    return hexLerp("#FFFFFF", "#FECACA", 0.2 + 0.75 * tDn);
  }

  var plainLabel = {
    "Fixed O&M": "Running costs",
        Efficiency: "Plant efficiency",
        Degradation: "Wear and tear",
        "Gas price": "If gas prices move",
        "Gas share": "If gas sets prices more/less often",
        Leverage: "Share borrowed from banks"
  };
  var plainUnit = {
    "€/MW-yr": "yearly upkeep cost",
    nameplate: "how much energy from each unit of gas",
    "%/yr": "% performance lost each year",
    shock: "vs today’s outlook",
    pp: "change in how often gas sets the price",
    "gearing · D11=1": "new plant · % paid with a bank loan"
  };

  host.innerHTML = grid.levers
    .map(function (lev) {
      var cells = lev.labels
        .map(function (lab, i) {
          var v = lev.values[i];
          return (
            '<div class="sensi-cell' +
            (i === lev.baseIndex ? " is-base" : "") +
            '" style="background:' +
            bgFor(v) +
            '"><div class="sensi-shock">' +
            lab +
            '</div><div class="sensi-val">' +
            (v / 1e6).toFixed(1) +
            "m</div></div>"
          );
        })
        .join("");
      return (
        '<div class="sensi-row"><div class="sensi-label"><strong>' +
        (plainLabel[lev.label] || lev.label) +
        "</strong><span>" +
        (plainUnit[lev.unit] || lev.unit) +
        '</span></div><div class="sensi-cells">' +
        cells +
        "</div></div>"
      );
    })
    .join("");
}

export async function bootTakeaways() {
  document.body.classList.add("is-booting");
  await window.ChartData.load();

  renderMap();
  renderMvf();
  renderTtf();
  renderLng();
  renderPpa();

  var data = await ensurePeData("./im_data/");
  renderCompound(data);

  var years = excelModelYears(PE_DEFAULTS);
  var path = buildImLinkedPricePath(
    data,
    {
      solarPct: 100,
      windPct: 100,
      windYear: "base",
      demandScenario: "B",
      ttfAdjustmentPct: 0
    },
    years
  );

  var pe0 = runPlantEconomics(
    Object.assign({}, PE_DEFAULTS, { construction: 0 }),
    path
  );
  var pe1 = runPlantEconomics(
    Object.assign({}, PE_DEFAULTS, { construction: 1 }),
    path
  );
  fillFinancing(pe0, pe1);
  renderPePair("pe0", pe0);
  renderPePair("pe1", pe1);

  var grid = computeScenSensiGrid(
    Object.assign({}, PE_DEFAULTS, { construction: 0 }),
    path
  );
  renderSensiGrid(grid);

  window.__TAKEAWAYS_LIVE__ = {
    pe0: { npv: pe0.equityNpv, irr: pe0.equityIrr, cross: pe0.crossoverYear },
    pe1: {
      npv: pe1.equityNpv,
      minDscr: pe1.minDscr,
      cum: pe1.cumulativeEquityCf
    },
    spanishMvf: window.ChartData.getCaptureCallouts().spanishSolar.mvf,
    sensiBaseCum: grid.levers[0].values[2],
    ready: true
  };

  document.body.classList.remove("is-booting");
  document.body.classList.add("is-ready");
  document.dispatchEvent(
    new CustomEvent("takeaways-ready", { detail: window.__TAKEAWAYS_LIVE__ })
  );
}

bootTakeaways().catch(function (err) {
  console.error(err);
  document.body.classList.add("is-error");
  var el = $("boot-error");
  if (el) {
    el.hidden = false;
    el.textContent = String(err && err.message ? err.message : err);
  }
});
