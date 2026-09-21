/**
 * Dashboard chart data bridge — loads validated im_data / pipeline outputs.
 * Exposes series getters + visible audit badges for data provenance.
 */
(function (global) {
  var BASE = "im_data/";
  var cache = null;
  var loadPromise = null;

  var BADGE_LABELS = {
    pipeline: "Validated pipeline",
    mixed: "Mixed sources",
    illustrative: "Illustrative",
    live_or_fallback: "Live + fallback"
  };

  var AUDIT = {
    "dash-combined-map": {
      status: "illustrative",
      note: "Pan-EU RE penetration choropleth — Ember/article estimates, not ENTSO-E pipeline"
    },
    "dash-spark-cann": {
      status: "pipeline",
      note: "Dashboard mini preview of Interaction Model price-formation bar (live IMState)"
    },
    "dash-spark-fin": {
      status: "pipeline",
      note: "Dashboard mini preview of Plant Economics Revenue & EBITDA (live engine)"
    },
    "chart-h1": {
      status: "illustrative",
      note: "Global LNG terminal geography — IGU / article notes; routes are schematic"
    },
    "chart-h2": {
      status: "pipeline",
      note: "TTF forward curve — im_data/ttf_forward_curve.json (ICE locked 17 Jul 2026)"
    },
    "chart-h3": {
      status: "mixed",
      note: "DE negative hours from ENTSO-E reference_table; NL/ES/FR/BE from article/IEA (no multi-zone pipeline)"
    },
    "chart-h4": {
      status: "illustrative",
      note: "DSCR / IRR cliff — stylised project finance table; no pipeline equivalent"
    },
    "cann-6-1": {
      status: "mixed",
      note: "DE MVF/neg hours from pipeline; other countries illustrative / live API penetration"
    },
    "cann-6-2": {
      status: "pipeline",
      note: "Load duration curves — ENTSO-E hourly load (embedded LDC_DATA)"
    },
    "cann-6-3": {
      status: "mixed",
      note: "DE row alignable with reference_table; other countries from article/IEA"
    },
    "cann-6-4": {
      status: "mixed",
      note: "DE empirical MVF from pipeline; Hirth/Aurora reference curves retained"
    },
    "cann-6-5": {
      status: "illustrative",
      note: "PPA vs breakeven — external market surveys (LevelTen/Veyt); no pipeline equivalent"
    },
    "cann-6-6": {
      status: "illustrative",
      note: "DSCR cliff — stylised; no pipeline equivalent"
    },
    "gas-ttf": {
      status: "pipeline",
      note: "Same TTF forward curve as Dashboard — im_data/ttf_forward_curve.json"
    },
    "gie-storage": {
      status: "live_or_fallback",
      note: "GIE AGSI+ live with static fallback"
    },
    "pe-spark": {
      status: "pipeline",
      note: "Plant Economics live engine — realized spark (price − all-in plant SRMC)"
    },
    "pe-revenue": {
      status: "pipeline",
      note: "Plant Economics live engine — revenue/EBITDA from Gas_Plant_v8 formulas + IM prices"
    },
    "pe-dscr": {
      status: "pipeline",
      note: "Plant Economics live engine — sculpted DSCR vs covenant (Excel Financ./Gear.)"
    },
    "pe-debt": {
      status: "pipeline",
      note: "Plant Economics live engine — EoP debt balance after sculpting/balloon"
    },
    "pe-waterfall": {
      status: "pipeline",
      note: "Plant Economics live engine — cash flow breakdown by operating year"
    },
    "pe-irr": {
      status: "pipeline",
      note: "Plant Economics live engine — ±20% tornado on current case (IRR or NPV Δ)"
    },
    "pe-opex": {
      status: "pipeline",
      note: "Plant Economics live engine — stacked fuel / var O&M / fixed O&M"
    },
    "pe-icr": {
      status: "pipeline",
      note: "Plant Economics live engine — ICR vs 5.0x covenant (Ass.!D28)"
    },
    "pe-bs": {
      status: "pipeline",
      note: "Plant Economics live engine — simplified net PPE vs EoP debt proxy"
    },
    "pe-npv-grid": {
      status: "pipeline",
      note: "Plant Economics live engine — Equity NPV two-way grid (elec × capex)"
    },
    "gas-imports": {
      status: "live_or_fallback",
      note: "EIA LNG exports live with static fallback"
    },
    "gas-jkm-ttf": {
      status: "illustrative",
      note: "JKM/TTF spread — hardcoded article snapshot; no live feed wired"
    },
    "gas-regas": {
      status: "illustrative",
      note: "Global regas capacity vs utilisation — IGU 2026 static"
    }
  };

  /* chartId, CSS selector, placement: overlay | card | inline */
  var AUDIT_PLACEMENTS = [
    ["dash-combined-map", "#dash-combined-map", "overlay"],
    ["dash-spark-cann", "#dash-pillar-cann", "card"],
    ["dash-spark-fin", "#dash-pillar-fin", "card"],
    ["chart-h2", "#chart-h2", "card"],
    ["chart-h3", "#chart-h3", "card"],
    ["chart-h1", "#chart-h1-plot", "overlay"],
    ["chart-h1", "#art-embed-h1", "overlay"],
    ["chart-h2", "#art-embed-h2", "overlay"],
    ["chart-h3", "#art-embed-h3", "overlay"],
    ["chart-h4", "#chart-h4-plot", "overlay"],
    ["chart-h4", "#art-embed-dscr", "overlay"],
    ["cann-6-1", "#cann-6-1-plot", "overlay"],
    ["cann-6-1", "#cann-6-1-meta", "inline"],
    ["cann-6-2", "#cann-6-2-plot", "overlay"],
    ["cann-6-3", "#cann-6-3-plot", "overlay"],
    ["cann-6-4", "#cann-6-4-plot", "overlay"],
    ["cann-6-4", "#art-embed-mvf", "overlay"],
    ["cann-6-5", "#cann-6-5-plot", "overlay"],
    ["cann-6-5", "#art-embed-ppa", "overlay"],
    ["cann-6-6", "#cann-6-6-plot", "overlay"],
    ["chart-h2", "#chart-h2-meta", "inline"],
    ["chart-h3", "#chart-h3-meta", "inline"],
    ["gas-ttf", "#gas-ttf-plot", "overlay"],
    ["gas-imports", "#gas-imports-plot", "overlay"],
    ["gas-jkm-ttf", "#gas-jkm-plot", "overlay"],
    ["gas-regas", "#gas-regas-plot", "overlay"],
    ["gie-storage", "#gie-storage-plot", "overlay"],
    ["pe-spark", "#pe-card-spark", "overlay"],
    ["pe-revenue", "#pe-card-revenue", "overlay"],
    ["pe-dscr", "#pe-card-dscr", "overlay"],
    ["pe-debt", "#pe-card-debt", "overlay"],
    ["pe-waterfall", "#pe-card-waterfall", "overlay"],
    ["pe-irr", "#pe-card-irr", "overlay"],
    ["pe-opex", "#pe-card-opex", "overlay"],
    ["pe-icr", "#pe-card-icr", "overlay"],
    ["pe-bs", "#pe-card-bs", "overlay"],
    ["pe-npv-grid", "#pe-card-npv-grid", "overlay"]
  ];

  function fetchJson(name) {
    return fetch(BASE + name).then(function (r) {
      if (!r.ok) throw new Error(name + " HTTP " + r.status);
      return r.json();
    });
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all([
      fetchJson("historical_reference_years.json").catch(function () { return null; }),
      fetchJson("reference_table_deu.json").catch(function () { return null; }),
      fetchJson("ttf_forward_curve.json").catch(function () { return null; }),
      fetchJson("scenario_chain_summary.json").catch(function () { return null; })
    ]).then(function (parts) {
      cache = {
        historical: parts[0],
        referenceDeu: parts[1],
        ttf: parts[2],
        scenario: parts[3]
      };
      return cache;
    });

    return loadPromise;
  }

  /**
   * Hirth (2013) MVF vs penetration — identical arrays to cann-6-4-plot.
   * Kept here so Dashboard sparks and Cannibalisation stay in lockstep.
   */
  function getHirthMvfCurves() {
    return {
      x: [5, 15, 25, 35, 45, 55, 65, 75],
      hirth: [0.92, 0.88, 0.84, 0.80, 0.72, 0.64, 0.55, 0.48],
      hirthLower: [0.90, 0.85, 0.80, 0.75, 0.66, 0.58, 0.50, 0.42]
    };
  }

  function getSparkCann() {
    if (!cache || !cache.historical) return null;
    var years = cache.historical.years.filter(function (y) {
      return y.penetration && y.mvf && y.mvf.solar != null;
    });
    var hirth = getHirthMvfCurves();
    return {
      x: years.map(function (y) { return y.penetration.renewable_pct; }),
      y: years.map(function (y) { return y.mvf.solar; }),
      labels: years.map(function (y) { return String(y.year); }),
      refX: hirth.x,
      refY: hirth.hirthLower,
      endFormat: "mvf",
      source: "ENTSO-E DE_LU MVF · Hirth lower bound (cann-6-4)"
    };
  }

  /**
   * Reference offshore project DSCR midpoints from the Cannibalisation /
   * Article §3.6 DSCR-cliff table (ranges mid-pointed for a single spark line).
   */
  function getSparkFin() {
    var rows = [
      { penetration: 35, dscr: 3.3 },
      { penetration: 50, dscr: 2.6 },
      { penetration: 62, dscr: 1.65 },
      { penetration: 65, dscr: 1.45 },
      { penetration: 70, dscr: 1.1 }
    ];
    return {
      x: rows.map(function (r) { return r.penetration; }),
      y: rows.map(function (r) { return r.dscr; }),
      endFormat: "dscr",
      source: "Article §3.6 / Cannibalisation DSCR-cliff reference table"
    };
  }

  function getTtfForward() {
    if (!cache || !cache.ttf) return null;
    var t = cache.ttf;
    return {
      asOf: t.meta.as_of_label || t.meta.as_of,
      source: t.meta.source,
      spot: { date: t.spot.date, price: t.spot.ttf_eur_mwh },
      srmcFloor: t.srmc_floor_us_gulf_coast,
      months: t.curve.map(function (p) { return p.month; }),
      prices: t.curve.map(function (p) { return p.ttf_eur_mwh; })
    };
  }

  function getDeNegativeHours() {
    if (!cache || !cache.referenceDeu) return null;
    return cache.referenceDeu.years.filter(function (y) {
      return y.negative_price_hours != null && y.year >= 2019;
    }).map(function (y) {
      return { year: y.year, hours: y.negative_price_hours };
    });
  }

  function getDeMvfEmpirical() {
    if (!cache || !cache.historical) return null;
    return cache.historical.years.map(function (y) {
      return {
        year: y.year,
        penetration: y.penetration.renewable_pct,
        solar_mvf: y.mvf.solar,
        wind_onshore_mvf: y.mvf.wind_onshore,
        wind_offshore_mvf: y.mvf.wind_offshore
      };
    });
  }

  /**
   * Capture-rate callouts used by Dashboard ticker + Cannibalisation 6.4
   * empirical markers. Single source so takeaways slides never re-hardcode.
   */
  function getCaptureCallouts() {
    return {
      spanishSolar: {
        mvf: 0.61,
        year: 2025,
        penetration: 62,
        monthlyLow: 0.4,
        monthlyLowLabel: "Apr 2024",
        source: "Cannibalisation §6.4 / article [12]"
      },
      germanOffshore: { mvf: 0.96, year: 2025, penetration: 58 }
    };
  }

  function auditLabel(chartId) {
    var a = AUDIT[chartId];
    if (!a) return null;
    var prefix = BADGE_LABELS[a.status] || a.status;
    return prefix + " — " + a.note;
  }

  function applyAuditBadge(chartId, anchorSelector, placement) {
    var a = AUDIT[chartId];
    if (!a) return;

    var anchor = anchorSelector.charAt(0) === "#" || anchorSelector.charAt(0) === "."
      ? document.querySelector(anchorSelector)
      : document.getElementById(anchorSelector);
    if (!anchor) return;

    var key = chartId + "::" + anchorSelector;
    var existing = anchor.querySelector('[data-audit-key="' + key + '"]');
    if (existing) return;

    var badge = document.createElement("span");
    badge.className = "chart-audit-badge chart-audit-badge--" + a.status;
    badge.setAttribute("data-audit-key", key);
    badge.setAttribute("data-chart-audit", a.status);
    badge.setAttribute("data-audit-for", chartId);
    badge.textContent = BADGE_LABELS[a.status] || a.status;
    badge.title = a.note;

    placement = placement || "overlay";
    if (placement === "overlay") {
      badge.classList.add("chart-audit-badge--overlay");
      anchor.appendChild(badge);
    } else if (placement === "card") {
      badge.classList.add("chart-audit-badge--card");
      anchor.appendChild(badge);
    } else {
      badge.classList.add("chart-audit-badge--inline");
      anchor.insertBefore(badge, anchor.firstChild);
    }

    if (anchor.classList.contains("card-meta") || anchor.classList.contains("figure-caption")) {
      anchor.setAttribute("data-chart-audit", a.status);
    }
  }

  function applyAllAuditBadges() {
    AUDIT_PLACEMENTS.forEach(function (row) {
      applyAuditBadge(row[0], row[1], row[2]);
    });
  }

  function bootAuditBadges() {
    applyAllAuditBadges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAuditBadges);
  } else {
    bootAuditBadges();
  }

  global.ChartData = {
    load: load,
    get: function () { return cache; },
    audit: AUDIT,
    auditLabel: auditLabel,
    applyAuditBadge: applyAuditBadge,
    applyAllAuditBadges: applyAllAuditBadges,
    getSparkCann: getSparkCann,
    getSparkFin: getSparkFin,
    getHirthMvfCurves: getHirthMvfCurves,
    getTtfForward: getTtfForward,
    getDeNegativeHours: getDeNegativeHours,
    getDeMvfEmpirical: getDeMvfEmpirical,
    getCaptureCallouts: getCaptureCallouts
  };
})(typeof window !== "undefined" ? window : this);
