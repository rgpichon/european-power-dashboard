/**
 * Combined Europe map — RE penetration choropleth + LNG supply routes.
 * Call: window.renderCombinedMap(elementId, { showLegend: true|false })
 *
 * Destinations reflect major operational regas terminals (IEEFA/GIIGNL):
 * Gate (Rotterdam), Le Havre, Huelva (Atlantic Spain), Aliaga (Turkey).
 * Routes use multi-waypoint great-circle legs through open-ocean lanes.
 */
(function (global) {
  var PT = global.PlotlyTheme;
  var D = global.DataColors || (PT && PT.data) || {
    ink: "#111827", g2: "#374151", g3: "#6B7280", g4: "#9CA3AF", g5: "#D1D5DB",
    paper: "#FFFFFF", good: "#16A34A", bad: "#DC2626",
    choropleth: [[0,"#F9FAFB"],[0.24,"#F9FAFB"],[0.25,"#D1D5DB"],[0.49,"#D1D5DB"],[0.5,"#9CA3AF"],[0.74,"#9CA3AF"],[0.75,"#374151"],[1,"#111827"]]
  };
  var FONT = PT ? PT.font : "Inter, sans-serif";

  var GEO_LON = [-95, 54];
  var GEO_LAT = [23, 72];
  var GEO_CENTER = { lon: -21.5, lat: 44.5 };
  var GEO_DOMAIN_X = [0, 0.86];
  var STEPS_PER_LEG = 10;
  var TAPER_SEGMENTS = 6;
  /** Tight px threshold — route tooltip only when cursor is on the ink line. */
  var ROUTE_HOVER_DISTANCE = 6;

  var PEN_BY_ISO = {
    DEU: 57.5, ESP: 62.5, DNK: 82, PRT: 65, NLD: 37.5, FRA: 27.5, GBR: 42.5,
    ITA: 40, BEL: 32, POL: 28, SWE: 68, NOR: 98, FIN: 52, AUT: 78, CHE: 62,
    CZE: 22, IRL: 42, GRC: 48, ROU: 45, HUN: 25, HRV: 38, BGR: 30, SVK: 24,
    SVN: 35, LTU: 55, LVA: 50, EST: 48, LUX: 20, SRB: 30, BIH: 40, ALB: 85,
    MKD: 35, MNE: 60, UKR: 18, BLR: 8, MDA: 12, TUR: 42, CYP: 20, MLT: 15,
    ISL: 100, AND: 20, LIE: 50, SMR: 20, MCO: 15
  };

  var NAME_BY_ISO = {
    DEU: "Germany", ESP: "Spain", DNK: "Denmark", PRT: "Portugal", NLD: "Netherlands",
    FRA: "France", GBR: "United Kingdom", ITA: "Italy", BEL: "Belgium", POL: "Poland",
    SWE: "Sweden", NOR: "Norway", FIN: "Finland", AUT: "Austria", CHE: "Switzerland",
    CZE: "Czechia", IRL: "Ireland", GRC: "Greece", ROU: "Romania", HUN: "Hungary",
    HRV: "Croatia", BGR: "Bulgaria", SVK: "Slovakia", SVN: "Slovenia", LTU: "Lithuania",
    LVA: "Latvia", EST: "Estonia", LUX: "Luxembourg", SRB: "Serbia", BIH: "Bosnia",
    ALB: "Albania", MKD: "N. Macedonia", MNE: "Montenegro", UKR: "Ukraine", BLR: "Belarus",
    MDA: "Moldova", TUR: "Turkey", CYP: "Cyprus", MLT: "Malta", ISL: "Iceland"
  };

  var US_GULF = { lon: -93.87, lat: 29.75, label: "US Gulf Coast" };
  var QATAR = { lon: 51.58, lat: 25.91, label: "Ras Laffan" };
  /** Gate Terminal — largest NWE regas hub (NL). */
  var ROTTERDAM = { lon: 4.14, lat: 51.95, label: "Rotterdam" };
  /** Le Havre — France NWE regas (illustrative label; FSRU decommissioned 2025). */
  var LE_HAVRE = { lon: 0.11, lat: 49.49, label: "Le Havre" };
  /** Huelva (Reganosa) — principal Atlantic-coast regas in Spain. */
  var HUELVA = { lon: -6.94, lat: 37.26, label: "Huelva" };
  /** Egegaz Aliaga — Turkey's largest LNG import terminal. */
  var ALIAGA = { lon: 26.97, lat: 38.76, label: "Aliaga" };

  var DEG = Math.PI / 180;

  function toRad(pt) {
    return { lon: pt.lon * DEG, lat: pt.lat * DEG };
  }

  function greatCircleLeg(a, b, steps) {
    var p0 = toRad(a);
    var p1 = toRad(b);
    var ax = Math.cos(p0.lat) * Math.cos(p0.lon);
    var ay = Math.cos(p0.lat) * Math.sin(p0.lon);
    var az = Math.sin(p0.lat);
    var bx = Math.cos(p1.lat) * Math.cos(p1.lon);
    var by = Math.cos(p1.lat) * Math.sin(p1.lon);
    var bz = Math.sin(p1.lat);
    var dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    var omega = Math.acos(dot);
    var lon = [], lat = [];
    if (omega < 1e-8) {
      for (var i = 0; i <= steps; i++) {
        lon.push(a.lon);
        lat.push(a.lat);
      }
      return { lon: lon, lat: lat };
    }
    var sinOmega = Math.sin(omega);
    for (var j = 0; j <= steps; j++) {
      var t = j / steps;
      var s0 = Math.sin((1 - t) * omega) / sinOmega;
      var s1 = Math.sin(t * omega) / sinOmega;
      var x = s0 * ax + s1 * bx;
      var y = s0 * ay + s1 * by;
      var z = s0 * az + s1 * bz;
      lon.push(Math.atan2(y, x) / DEG);
      lat.push(Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG);
    }
    return { lon: lon, lat: lat };
  }

  function waypointPath(waypoints, stepsPerLeg) {
    var lon = [], lat = [];
    for (var i = 0; i < waypoints.length - 1; i++) {
      var leg = greatCircleLeg(waypoints[i], waypoints[i + 1], stepsPerLeg);
      var start = i === 0 ? 0 : 1;
      for (var k = start; k < leg.lon.length; k++) {
        lon.push(leg.lon[k]);
        lat.push(leg.lat[k]);
      }
    }
    return { lon: lon, lat: lat };
  }

  var ROUTE_DEFS = [
    {
      name: "US Gulf → Rotterdam",
      group: "us",
      dest: ROTTERDAM,
      path: waypointPath([
        US_GULF,
        { lon: -87.2, lat: 25.8 },
        { lon: -72.5, lat: 28.5 },
        { lon: -52.0, lat: 33.5 },
        { lon: -32.0, lat: 40.5 },
        { lon: -12.5, lat: 47.8 },
        { lon: -2.0, lat: 50.5 },
        ROTTERDAM
      ], STEPS_PER_LEG)
    },
    {
      name: "US Gulf → Le Havre",
      group: "us",
      dest: LE_HAVRE,
      path: waypointPath([
        US_GULF,
        { lon: -87.2, lat: 25.8 },
        { lon: -73.0, lat: 28.0 },
        { lon: -52.0, lat: 33.0 },
        { lon: -32.0, lat: 40.0 },
        { lon: -14.0, lat: 47.0 },
        { lon: -4.5, lat: 49.0 },
        LE_HAVRE
      ], STEPS_PER_LEG)
    },
    {
      name: "US Gulf → Huelva",
      group: "us",
      dest: HUELVA,
      path: waypointPath([
        US_GULF,
        { lon: -87.2, lat: 25.8 },
        { lon: -74.0, lat: 27.5 },
        { lon: -55.0, lat: 30.0 },
        { lon: -38.0, lat: 33.5 },
        { lon: -20.0, lat: 35.5 },
        { lon: -10.5, lat: 36.2 },
        { lon: -8.8, lat: 36.8 },
        HUELVA
      ], STEPS_PER_LEG)
    },
    {
      name: "Qatar → Rotterdam",
      group: "qa",
      dest: ROTTERDAM,
      path: waypointPath([
        QATAR,
        { lon: 57.2, lat: 26.2 },
        { lon: 41.5, lat: 21.5 },
        { lon: 33.2, lat: 28.8 },
        { lon: 24.5, lat: 34.2 },
        { lon: 14.0, lat: 36.8 },
        { lon: -5.4, lat: 35.9 },
        { lon: -9.5, lat: 43.5 },
        { lon: -1.5, lat: 49.5 },
        ROTTERDAM
      ], STEPS_PER_LEG)
    },
    {
      name: "Qatar → Aliaga",
      group: "qa",
      dest: ALIAGA,
      path: waypointPath([
        QATAR,
        { lon: 57.2, lat: 26.2 },
        { lon: 41.5, lat: 21.5 },
        { lon: 33.2, lat: 28.8 },
        { lon: 28.0, lat: 33.5 },
        { lon: 24.5, lat: 35.0 },
        { lon: 27.5, lat: 37.0 },
        ALIAGA
      ], STEPS_PER_LEG)
    }
  ];

  function penArrays() {
    var locations = [], z = [], text = [];
    Object.keys(PEN_BY_ISO).forEach(function (iso) {
      locations.push(iso);
      z.push(PEN_BY_ISO[iso]);
      text.push((NAME_BY_ISO[iso] || iso) + "<br>RE penetration: " + PEN_BY_ISO[iso] + "%");
    });
    return { locations: locations, z: z, text: text };
  }

  var RE_SCALE_MIN = 0;
  var RE_SCALE_MAX = 100;
  var RE_SCALE_TICKS = [0, 20, 40, 60, 80, 100];

  function buildChoropleth(showScale, opts) {
    opts = opts || {};
    var arr = penArrays();
    if (opts.germanyPenetrationPct != null && Number.isFinite(opts.germanyPenetrationPct)) {
      var deIdx = arr.locations.indexOf("DEU");
      if (deIdx >= 0) {
        arr.z[deIdx] = opts.germanyPenetrationPct;
        arr.text[deIdx] =
          "Germany<br>RE share of demand (this scenario): " +
          opts.germanyPenetrationPct.toFixed(1) + "%";
      }
    }
    return {
      type: "choropleth",
      locationmode: "ISO-3",
      locations: arr.locations,
      z: arr.z,
      text: arr.text,
      hovertemplate: "<b>%{text}</b><extra></extra>",
      colorscale: D.choropleth,
      zmin: RE_SCALE_MIN,
      zmax: RE_SCALE_MAX,
      autocolorscale: false,
      marker: { line: { width: 0.35, color: D.paper }, opacity: 1 },
      showscale: showScale,
      colorbar: PT ? PT.colorbar({
        title: { text: "RE %", side: "right" },
        len: 0.86,
        y: 0.47,
        yanchor: "middle",
        thickness: 10,
        tickmode: "array",
        tickvals: RE_SCALE_TICKS,
        ticktext: RE_SCALE_TICKS.map(function (v) { return v + "%"; }),
        tickfont: { color: D.g3, size: 10 },
        outlinewidth: 0
      }) : {
        title: { text: "RE %", side: "right" },
        len: 0.86,
        y: 0.47,
        yanchor: "middle",
        thickness: 10,
        tickmode: "array",
        tickvals: RE_SCALE_TICKS,
        ticktext: RE_SCALE_TICKS.map(function (v) { return v + "%"; }),
        tickfont: { color: D.g3, size: 10 },
        outlinewidth: 0
      },
      _mapChoropleth: true
    };
  }

  function taperedRouteSegments(path, lineStyle, minW, maxW) {
    var traces = [];
    var n = path.lon.length;
    for (var s = 0; s < TAPER_SEGMENTS; s++) {
      var i0 = Math.floor(s * (n - 1) / TAPER_SEGMENTS);
      var i1 = Math.floor((s + 1) * (n - 1) / TAPER_SEGMENTS);
      if (i1 <= i0) continue;
      var tMid = (s + 0.5) / TAPER_SEGMENTS;
      var w = minW + tMid * (maxW - minW);
      traces.push({
        type: "scattergeo",
        lon: path.lon.slice(i0, i1 + 1),
        lat: path.lat.slice(i0, i1 + 1),
        mode: "lines",
        line: extendLine(lineStyle, w),
        hoverinfo: "skip",
        showlegend: false
      });
    }
    return traces;
  }

  function extendLine(base, width) {
    return {
      width: width,
      color: base.color || D.ink,
      dash: base.dash || "solid"
    };
  }

  function fullRouteShadow(path) {
    return {
      type: "scattergeo",
      lon: path.lon,
      lat: path.lat,
      mode: "lines",
      line: { width: 4, color: "rgba(17, 24, 39, 0.06)" },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  /** Invisible hit line — tight hoverdistance so countries win unless cursor is on ink. */
  function routeHoverHit(route) {
    return {
      type: "scattergeo",
      lon: route.path.lon,
      lat: route.path.lat,
      mode: "lines",
      name: route.name,
      line: { width: 1, color: "rgba(0,0,0,0)" },
      opacity: 0,
      hoverinfo: "text",
      hovertemplate: "<b>" + route.name + "</b><br>" + route.dest.label + " regas terminal<extra></extra>",
      hoverdistance: ROUTE_HOVER_DISTANCE,
      showlegend: false,
      _routeHover: true
    };
  }

  function routeTraces(showLegend) {
    var traces = [];
    var routeHoverIdx = [];
    var usStyle = { color: D.ink, dash: "solid" };
    var qaStyle = { color: D.g2, dash: "dash" };

    ROUTE_DEFS.forEach(function (route) {
      var style = route.group === "qa" ? qaStyle : usStyle;
      traces.push(fullRouteShadow(route.path));
      taperedRouteSegments(route.path, style, 0.7, 2.8).forEach(function (t) {
        traces.push(t);
      });
      routeHoverIdx.push(traces.length);
      traces.push(routeHoverHit(route));
    });

    var terminals = [
      { pt: US_GULF, halo: 20, core: 6, pos: "bottom center" },
      { pt: QATAR, halo: 18, core: 6, pos: "bottom center" },
      { pt: ROTTERDAM, halo: 14, core: 5, pos: "top center" },
      { pt: LE_HAVRE, halo: 14, core: 5, pos: "middle right" },
      { pt: HUELVA, halo: 14, core: 5, pos: "top center" },
      { pt: ALIAGA, halo: 14, core: 5, pos: "top center" }
    ];

    traces.push({
      type: "scattergeo",
      lon: terminals.map(function (t) { return t.pt.lon; }),
      lat: terminals.map(function (t) { return t.pt.lat; }),
      mode: "markers",
      marker: {
        size: terminals.map(function (t) { return t.halo; }),
        color: D.g3,
        opacity: 0.12,
        line: { width: 0 }
      },
      hoverinfo: "skip",
      showlegend: false
    });

    traces.push({
      type: "scattergeo",
      lon: terminals.map(function (t) { return t.pt.lon; }),
      lat: terminals.map(function (t) { return t.pt.lat; }),
      mode: "markers",
      marker: {
        size: terminals.map(function (t) { return t.core; }),
        color: D.g2,
        line: { width: 1, color: D.paper }
      },
      text: terminals.map(function (t) { return t.pt.label; }),
      hovertemplate: "<b>%{text}</b><br>LNG terminal<extra></extra>",
      hoverdistance: 12,
      showlegend: false
    });

    traces.push({
      type: "scattergeo",
      lon: terminals.map(function (t) { return t.pt.lon; }),
      lat: terminals.map(function (t) { return t.pt.lat; }),
      text: terminals.map(function (t) { return t.pt.label; }),
      mode: "text",
      textposition: terminals.map(function (t) { return t.pos; }),
      textfont: { family: FONT, size: 10, color: D.g3 },
      hoverinfo: "skip",
      showlegend: false
    });

    if (showLegend) {
      traces.push({
        type: "scattergeo", lon: [null], lat: [null], mode: "lines",
        name: "US Gulf → Europe (solid)",
        line: { width: 2, color: D.ink, dash: "solid" },
        hoverinfo: "skip",
        showlegend: true
      });
      traces.push({
        type: "scattergeo", lon: [null], lat: [null], mode: "lines",
        name: "Qatar → Europe / Turkey (dashed)",
        line: { width: 2, color: D.g2, dash: "dash" },
        hoverinfo: "skip",
        showlegend: true
      });
    }

    return { traces: traces, routeHoverIdx: routeHoverIdx };
  }

  function geoLayoutBlock(showLegend, projectionType) {
    var y1 = showLegend ? 0.90 : 0.94;
    return {
      scope: "world",
      domain: { x: GEO_DOMAIN_X.slice(), y: [0.04, y1] },
      center: { lon: GEO_CENTER.lon, lat: GEO_CENTER.lat },
      projection: { type: projectionType || "mercator" },
      lonaxis: { range: GEO_LON.slice() },
      lataxis: { range: GEO_LAT.slice() },
      fitbounds: false,
      showland: true,
      landcolor: "#ECEFF3",
      showocean: true,
      oceancolor: "#F7F8FA",
      showcountries: true,
      countrycolor: "rgba(203, 213, 225, 0.55)",
      countrywidth: 0.5,
      showcoastlines: true,
      coastlinecolor: "rgba(148, 163, 184, 0.32)",
      coastlinewidth: 0.6,
      showframe: false,
      bgcolor: D.paper
    };
  }

  function layoutMargins(showLegend) {
    return { t: 8, r: 8, b: showLegend ? 36 : 12, l: 8 };
  }

  function layoutLegend(showLegend) {
    if (!showLegend) return undefined;
    return PT ? PT.legend({
      orientation: "h",
      y: -0.06,
      yanchor: "top",
      x: 0,
      xanchor: "left",
      font: { size: 10, color: D.g3 }
    }) : {
      orientation: "h",
      y: -0.06,
      yanchor: "top",
      x: 0,
      xanchor: "left",
      font: { size: 10, color: D.g3 }
    };
  }

  function layout(showLegend, projectionType) {
    return {
      margin: layoutMargins(showLegend),
      paper_bgcolor: D.paper,
      font: { family: FONT, size: 11, color: D.ink },
      hovermode: "closest",
      uirevision: "combined-map-v9-mercator",
      showlegend: !!showLegend,
      legend: layoutLegend(showLegend),
      geo: geoLayoutBlock(showLegend, projectionType)
    };
  }

  function attachGeoFit(el) {
    if (!el || el._geoFitBound) return;
    el._geoFitBound = true;
    var run = function () {
      if (typeof Plotly === "undefined" || !el.clientWidth) return;
      try { Plotly.Plots.resize(el); } catch (e) { /* ignore */ }
    };
    run();
    if (typeof ResizeObserver !== "undefined") {
      el._geoFitObserver = new ResizeObserver(run);
      el._geoFitObserver.observe(el);
    } else {
      window.addEventListener("resize", run);
    }
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function attachGeoClamp(el) {
    if (!el || el._geoClampBound) return;
    el._geoClampBound = true;
    el.on("plotly_relayout", function (ev) {
      if (!ev) return;
      var patch = {};
      var lonKey = "geo.lonaxis.range";
      var latKey = "geo.lataxis.range";
      var lon = ev[lonKey] || ev["geo.lonaxis.range[0]"] != null && [
        ev["geo.lonaxis.range[0]"], ev["geo.lonaxis.range[1]"]
      ];
      var lat = ev[latKey] || ev["geo.lataxis.range[0]"] != null && [
        ev["geo.lataxis.range[0]"], ev["geo.lataxis.range[1]"]
      ];
      if (lon && lon.length === 2) {
        var w = lon[1] - lon[0];
        var maxW = GEO_LON[1] - GEO_LON[0];
        if (w >= maxW) {
          patch["geo.lonaxis.range"] = GEO_LON.slice();
        } else {
          patch["geo.lonaxis.range"] = [
            clamp(lon[0], GEO_LON[0], GEO_LON[1] - w),
            clamp(lon[1], GEO_LON[0] + w, GEO_LON[1])
          ];
          if (patch["geo.lonaxis.range"][0] === lon[0] && patch["geo.lonaxis.range"][1] === lon[1]) {
            delete patch["geo.lonaxis.range"];
          }
        }
      }
      if (lat && lat.length === 2) {
        var h = lat[1] - lat[0];
        var maxH = GEO_LAT[1] - GEO_LAT[0];
        if (h >= maxH) {
          patch["geo.lataxis.range"] = GEO_LAT.slice();
        } else {
          patch["geo.lataxis.range"] = [
            clamp(lat[0], GEO_LAT[0], GEO_LAT[1] - h),
            clamp(lat[1], GEO_LAT[0] + h, GEO_LAT[1])
          ];
          if (patch["geo.lataxis.range"][0] === lat[0] && patch["geo.lataxis.range"][1] === lat[1]) {
            delete patch["geo.lataxis.range"];
          }
        }
      }
      if (Object.keys(patch).length) {
        Plotly.relayout(el, patch);
      }
    });
  }

  function renderCombinedMap(elId, opts) {
    opts = opts || {};
    if (typeof Plotly === "undefined") return Promise.resolve(false);
    var el = typeof elId === "string" ? document.getElementById(elId) : elId;
    if (!el) return Promise.resolve(false);

    el.style.height = "";

    var showLegend = opts.showLegend !== false;
    if (opts.bounds) {
      GEO_LON = opts.bounds.lon;
      GEO_LAT = opts.bounds.lat;
      GEO_CENTER = opts.bounds.center || {
        lon: (GEO_LON[0] + GEO_LON[1]) / 2,
        lat: (GEO_LAT[0] + GEO_LAT[1]) / 2
      };
    }
    var choropleth = buildChoropleth(showLegend, opts);
    var traces = [choropleth];
    if (!opts.hideRoutes) {
      var routePack = routeTraces(showLegend);
      traces = traces.concat(routePack.traces);
    }
    if (opts.germanyPenetrationPct != null && Number.isFinite(opts.germanyPenetrationPct)) {
      traces.push({
        type: "scattergeo",
        lon: [10.45],
        lat: [51.16],
        mode: "text",
        text: ["DE " + opts.germanyPenetrationPct.toFixed(1) + "%"],
        textfont: { family: FONT, size: 11, color: D.ink, weight: 600 },
        hoverinfo: "skip",
        showlegend: false
      });
    }
    var lay = layout(showLegend, opts.projection);
    if (opts.hideRoutes) {
      lay.uirevision = "im-europe-map-v1";
    }
    var cfg = extend({ displayModeBar: false, responsive: true, scrollZoom: true }, opts.config || {});

    var plotFn = (el.data && el.data.length && !opts.forceNew)
      ? Plotly.react.bind(Plotly)
      : Plotly.newPlot.bind(Plotly);

    return plotFn(el, traces, lay, cfg).then(function () {
      if (!opts.skipClamp) attachGeoClamp(el);
      attachGeoFit(el);
      return true;
    });
  }

  function extend(a, b) {
    var o = {};
    Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { o[k] = b[k]; });
    return o;
  }

  global.renderCombinedMap = renderCombinedMap;
  global.fitCombinedMap = function (el) {
    if (!el || typeof Plotly === "undefined") return Promise.resolve();
    try { Plotly.Plots.resize(el); } catch (e) { /* ignore */ }
    return Promise.resolve();
  };
  global.__COMBINED_MAP_PEN = PEN_BY_ISO;
  global.__COMBINED_MAP_GEO = { lon: GEO_LON, lat: GEO_LAT };
  global.__COMBINED_MAP_PORTS = {
    US_GULF: US_GULF, QATAR: QATAR, ROTTERDAM: ROTTERDAM,
    LE_HAVRE: LE_HAVRE, HUELVA: HUELVA, ALIAGA: ALIAGA
  };
})(typeof window !== "undefined" ? window : this);
