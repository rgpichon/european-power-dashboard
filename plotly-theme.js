/**
 * Shared Plotly theme — financial-publication grade (FT / Bloomberg restraint).
 * Apply via PlotlyTheme.newPlot() or layout/trace helpers.
 */
(function (global) {
  var C = {
    blue: "#1D4ED8",
    orange: "#EA580C",
    green: "#16A34A",
    red: "#DC2626",
    teal: "#0D9488",
    text: "#111827",
    secondary: "#6B7280",
    grey: "#9CA3AF",
    muted: "#D1D5DB",
    border: "#E5E7EB",
    grid: "rgba(229, 231, 235, 0.45)",
    paper: "#FFFFFF",
    plot: "#FFFFFF",
    land: "#ECEFF3",
    ocean: "#F7F8FA",
    coastline: "rgba(148, 163, 184, 0.32)",
    country: "rgba(203, 213, 225, 0.55)",
    shadow: "rgba(17, 24, 39, 0.07)"
  };

  var FONT = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";
  var FONT_SIZES = { tick: 10, axis: 11, legend: 10, title: 12, annotation: 10 };

  var SEQ_GRAY = [
    [0, "#F9FAFB"],
    [0.25, "#D1D5DB"],
    [0.5, "#9CA3AF"],
    [0.75, "#374151"],
    [1, "#111827"]
  ];

  var SEQ_BLUE = SEQ_GRAY;

  var SEQ_HEAT = [
    [0, "#FFFFFF"],
    [0.2, "#FEE2E2"],
    [0.5, "#FCA5A5"],
    [0.8, "#EF4444"],
    [1, "#991B1B"]
  ];

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
          target[k] = extend(target[k] || {}, v);
        } else {
          target[k] = v;
        }
      });
    }
    return target;
  }

  function plotConfig(opts) {
    return extend({
      staticPlot: false,
      displayModeBar: false,
      responsive: true,
      doubleClick: "reset"
    }, opts || {});
  }

  function axisBase(overrides) {
    return extend({
      showgrid: true,
      gridcolor: C.grid,
      gridwidth: 1,
      zeroline: false,
      showline: true,
      linecolor: C.border,
      linewidth: 1,
      mirror: false,
      ticks: "outside",
      ticklen: 4,
      tickwidth: 1,
      tickcolor: C.border,
      tickfont: { family: FONT, size: FONT_SIZES.tick, color: C.secondary },
      title: { font: { family: FONT, size: FONT_SIZES.axis, color: C.secondary }, standoff: 8 }
    }, overrides || {});
  }

  function cartesianLayout(overrides) {
    return extend({
      margin: { t: 28, r: 16, b: 48, l: 52 },
      paper_bgcolor: C.paper,
      plot_bgcolor: C.plot,
      font: { family: FONT, size: FONT_SIZES.title, color: C.text },
      hoverlabel: {
        bgcolor: C.paper,
        bordercolor: C.border,
        font: { family: FONT, size: FONT_SIZES.tick, color: C.text }
      },
      xaxis: axisBase({ showgrid: false }),
      yaxis: axisBase(),
      legend: legend()
    }, overrides || {});
  }

  function legend(overrides) {
    return extend({
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      x: 0,
      xanchor: "left",
      bgcolor: "rgba(255,255,255,0)",
      borderwidth: 0,
      font: { family: FONT, size: FONT_SIZES.legend, color: C.secondary }
    }, overrides || {});
  }

  function sparkLayout(yRange) {
    return {
      margin: { t: 2, r: 2, b: 2, l: 2 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: { visible: false, fixedrange: true },
      yaxis: { visible: false, range: yRange, fixedrange: true },
      showlegend: false,
      hovermode: false
    };
  }

  function geoBase(overrides) {
    return extend({
      scope: "world",
      projection: { type: "natural earth" },
      showland: true,
      landcolor: C.land,
      showocean: true,
      oceancolor: C.ocean,
      showlakes: true,
      lakecolor: C.ocean,
      showrivers: false,
      showcountries: true,
      countrycolor: C.country,
      countrywidth: 0.5,
      showcoastlines: true,
      coastlinecolor: C.coastline,
      coastlinewidth: 0.6,
      showframe: false,
      bgcolor: C.paper,
      resolution: 50
    }, overrides || {});
  }

  function geoLayout(overrides) {
    return extend({
      margin: { t: 8, r: 8, b: 8, l: 8 },
      paper_bgcolor: C.paper,
      plot_bgcolor: C.paper,
      font: { family: FONT, size: FONT_SIZES.title, color: C.text },
      showlegend: false,
      geo: geoBase()
    }, overrides || {});
  }

  function colorbar(overrides) {
    return extend({
      thickness: 8,
      len: 0.45,
      outlinewidth: 0,
      ticklen: 3,
      tickfont: { family: FONT, size: FONT_SIZES.tick, color: C.secondary },
      title: { font: { family: FONT, size: FONT_SIZES.tick, color: C.secondary } }
    }, overrides || {});
  }

  function lineTrace(x, y, opts) {
    opts = opts || {};
    return extend({
      x: x,
      y: y,
      type: "scatter",
      mode: opts.mode || "lines",
      name: opts.name || "",
      line: extend({
        width: opts.width != null ? opts.width : 1.75,
        color: opts.color || C.text,
        shape: opts.shape || "linear"
      }, opts.line || {}),
      hovertemplate: opts.hovertemplate || "%{y}<extra>%{fullData.name}</extra>"
    }, opts.extra || {});
  }

  function barTrace(x, y, opts) {
    opts = opts || {};
    return extend({
      x: x,
      y: y,
      type: "bar",
      name: opts.name || "",
      marker: {
        color: opts.color || C.text,
        line: { width: 0, color: "rgba(0,0,0,0)" }
      },
      hovertemplate: opts.hovertemplate || "%{x}<br>%{y}<extra></extra>"
    }, opts.extra || {});
  }

  function spotMarker(x, y, opts) {
    opts = opts || {};
    return extend({
      x: x,
      y: y,
      type: "scatter",
      mode: "markers",
      name: opts.name || "Spot",
      marker: {
        color: opts.color || C.text,
        size: opts.size != null ? opts.size : 7,
        symbol: opts.symbol || "circle",
        line: { width: 1, color: C.paper }
      },
      hovertemplate: opts.hovertemplate || "%{y}<extra>%{fullData.name}</extra>"
    }, opts.extra || {});
  }

  function bandFill(x, yLow, yHigh, opts) {
    opts = opts || {};
    var hi = lineTrace(x, yHigh, {
      name: opts.name || "Band",
      width: 0,
      color: opts.color || C.grey,
      extra: { showlegend: opts.showlegend !== false, hoverinfo: "skip" }
    });
    var lo = lineTrace(x, yLow, {
      width: 0,
      color: opts.color || C.grey,
      extra: {
        fill: "tonexty",
        fillcolor: opts.fillcolor || "rgba(209, 213, 219, 0.35)",
        showlegend: false,
        hoverinfo: "skip"
      }
    });
    return [hi, lo];
  }

  function normalizeTrace(trace, profile) {
    if (!trace || trace._ptThemed) return trace;
    var t = extend({}, trace);
    t._ptThemed = true;

    if (profile === "spark") {
      if (t._dashPillarStat) {
        t.hoverinfo = "skip";
        return t;
      }
      if (t.fill) delete t.fill;
      if (t.fillcolor) delete t.fillcolor;
      if (t.line) t.line.width = t.line.width || 1.5;
      t.hoverinfo = "skip";
      return t;
    }

    if (t.type === "scatter" && t.mode && t.mode.indexOf("lines") >= 0) {
      if (t._dashPillarStat) {
        t.hoverinfo = "skip";
        return t;
      }
      t.line = extend({ width: 1.75, shape: "linear" }, t.line || {});
      if (t.mode.indexOf("markers") < 0 && !t.fill) {
        /* pure lines — no oversized markers */
      }
    }

    if (t.type === "scatter" && t.mode && t.mode.indexOf("markers") >= 0 && t.marker) {
      if (t._dashPillarStat) {
        t.hoverinfo = "skip";
        return t;
      }
      if (t.marker.size > 9) t.marker.size = 9;
      t.marker.line = extend({ width: 0.75, color: C.paper }, t.marker.line || {});
    }

    if (t.type === "bar" && t.marker) {
      t.marker.line = { width: 0, color: "rgba(0,0,0,0)" };
    }

    if (t.type === "heatmap" && !t.colorbar) {
      t.colorbar = colorbar();
    }

    if (t.type === "choropleth") {
      t.marker = extend({ line: { width: 0.35, color: C.paper } }, t.marker || {});
      if (!t.colorscale) t.colorscale = SEQ_GRAY;
      t.colorbar = colorbar(t.colorbar || {});
    }

    return t;
  }

  function normalizeLayout(layout, profile) {
    var lay = extend({}, layout || {});

    if (profile === "spark") return lay;

    lay.font = extend({ family: FONT, size: FONT_SIZES.title, color: C.text }, lay.font || {});
    lay.hoverlabel = extend({
      bgcolor: C.paper,
      bordercolor: C.border,
      font: { family: FONT, size: FONT_SIZES.tick, color: C.text }
    }, lay.hoverlabel || {});

    if (profile === "geo" || lay.geo) {
      lay.geo = geoBase(lay.geo || {});
      return lay;
    }

    if (lay.xaxis) {
      lay.xaxis = axisBase(extend({ showgrid: false }, lay.xaxis));
    }
    if (lay.yaxis) {
      lay.yaxis = axisBase(lay.yaxis);
    }
    if (lay.yaxis2) {
      lay.yaxis2 = axisBase(extend({ overlaying: "y", side: "right" }, lay.yaxis2));
    }

    return lay;
  }

  function newPlot(el, traces, layout, config, profile) {
    if (typeof Plotly === "undefined") return Promise.resolve(false);
    var target = typeof el === "string" ? document.getElementById(el) : el;
    if (!target) return Promise.resolve(false);
    profile = profile || (layout && layout.geo ? "geo" : "cartesian");
    var data = (Array.isArray(traces) ? traces : [traces]).map(function (t) {
      return normalizeTrace(t, profile);
    });
    var lay = normalizeLayout(layout, profile === "geo" ? "geo" : profile);
    var cfg = plotConfig(config);
    return Plotly.newPlot(target, data, lay, cfg);
  }

  global.PlotlyTheme = {
    colors: C,
    data: global.DataColors || null,
    font: FONT,
    fontSizes: FONT_SIZES,
    scales: { gray: SEQ_GRAY, blue: SEQ_GRAY, heat: SEQ_HEAT },
    extend: extend,
    plotConfig: plotConfig,
    cartesianLayout: cartesianLayout,
    sparkLayout: sparkLayout,
    geoLayout: geoLayout,
    geoBase: geoBase,
    axisBase: axisBase,
    legend: legend,
    colorbar: colorbar,
    lineTrace: lineTrace,
    barTrace: barTrace,
    spotMarker: spotMarker,
    bandFill: bandFill,
    normalizeTrace: normalizeTrace,
    normalizeLayout: normalizeLayout,
    newPlot: newPlot,
    install: installPlotlyWrapper
  };

  function installPlotlyWrapper() {
    if (typeof Plotly === "undefined" || Plotly.__ptWrapped) return;
    var orig = Plotly.newPlot.bind(Plotly);
    Plotly.newPlot = function (el, data, layout, config) {
      var lay = layout || {};
      var profile = "cartesian";
      if (lay.geo) profile = "geo";
      else if (lay.xaxis && lay.xaxis.visible === false && lay.yaxis && lay.yaxis.visible === false) profile = "spark";
      var traces = (Array.isArray(data) ? data : [data]).map(function (t) {
        return normalizeTrace(t, profile);
      });
      return orig(el, traces, normalizeLayout(lay, profile), plotConfig(config));
    };
    Plotly.__ptWrapped = true;
  }

  if (typeof Plotly !== "undefined") {
    installPlotlyWrapper();
  }

  if (global.DataColors && global.PlotlyTheme) {
    global.PlotlyTheme.data = global.DataColors;
  }
})(typeof window !== "undefined" ? window : this);
