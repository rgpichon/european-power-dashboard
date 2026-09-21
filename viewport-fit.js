/**
 * Viewport-fit: size the first chart row on Dashboard / Interaction /
 * Cannibalisation so it fits fully in the visible window without scrolling.
 */
(function (global) {
  var MIN_H = 240;
  var MAX_H = 600;
  var BUFFER = 24;
  var RESIZE_DEBOUNCE_MS = 150;

  var TAB_CONFIG = {
    interaction: {
      panelId: "panel-interaction",
      rowSelector: "#panel-interaction .im-output-grid",
      plotSelectors: ["#im-ttf-chart", "#im-duration-chart"]
    },
    cannibalisation: {
      panelId: "panel-cannibalisation",
      rowSelector: "#panel-cannibalisation .figure-frame--merit-order",
      plotSelectors: ["#cann-merit-order-plot"]
    }
  };

  var dirty = {
    interaction: true,
    cannibalisation: true
  };

  var resizeTimer = null;
  var scheduled = false;
  var retryTimer = null;
  var retryCount = 0;
  var MAX_RETRIES = 8;

  function activeTabId() {
    var tab = document.querySelector('.nav-tab[aria-selected="true"]');
    return tab ? tab.getAttribute("data-tab") : null;
  }

  function panelVisible(panel) {
    if (!panel) return false;
    if (panel.hidden) return false;
    if (panel.getAttribute("data-active") !== "true") return false;
    var cs = getComputedStyle(panel);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function rowUsable(row) {
    if (!row) return false;
    var cs = getComputedStyle(row);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    // Hidden ancestors (e.g. #im-output[hidden]) collapse layout
    var node = row;
    while (node && node !== document.body) {
      if (node.hidden) return false;
      node = node.parentElement;
    }
    return row.getBoundingClientRect().width > 0;
  }

  function measureStackHeight(row) {
    // Document Y of chart-row top == viewport occupancy above the row at scrollY=0
    return row.getBoundingClientRect().top + window.scrollY;
  }

  function resizePlots(selectors) {
    if (typeof Plotly === "undefined") return;
    selectors.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el || !el.data) return;
      try {
        Plotly.Plots.resize(el);
      } catch (e) {
        /* ignore Plotly mid-init */
      }
    });
  }

  /**
   * Fit the first chart row of tabId into the remaining viewport.
   * Only operates on a visible panel; otherwise marks dirty and returns null.
   */
  function fitChartRowToViewport(tabId) {
    var cfg = TAB_CONFIG[tabId];
    if (!cfg) return null;

    var panel = document.getElementById(cfg.panelId);
    if (!panelVisible(panel)) {
      dirty[tabId] = true;
      return null;
    }

    var row = document.querySelector(cfg.rowSelector);
    if (!rowUsable(row)) {
      dirty[tabId] = true;
      return null;
    }

    // --- READ phase (batch) ---
    var innerH = window.innerHeight;
    var stackH = measureStackHeight(row);
    var available = innerH - stackH - BUFFER;
    var clamped = Math.max(MIN_H, Math.min(MAX_H, available));

    // --- WRITE phase ---
    row.style.transition = "none";
    row.style.setProperty("--fit-chart-h", clamped + "px");
    row.style.height = clamped + "px";
    row.classList.add("is-viewport-fit");

    resizePlots(cfg.plotSelectors);

    dirty[tabId] = false;

    return {
      tabId: tabId,
      innerHeight: innerH,
      stackHeight: Math.round(stackH * 100) / 100,
      availableRaw: Math.round(available * 100) / 100,
      availableClamped: clamped,
      rowBottom: Math.round((stackH + clamped) * 100) / 100,
      fullyVisible: stackH + clamped <= innerH
    };
  }

  function afterLayout(fn) {
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  function scheduleFit(tabId) {
    var id = tabId || activeTabId();
    if (!TAB_CONFIG[id]) return;
    if (scheduled) {
      dirty[id] = true;
      return;
    }
    scheduled = true;
    afterLayout(function () {
      scheduled = false;
      var active = activeTabId();
      if (!TAB_CONFIG[active]) return;

      var result = null;
      if (dirty[active] || active === id) {
        result = fitChartRowToViewport(active);
      }

      Object.keys(TAB_CONFIG).forEach(function (tid) {
        if (tid !== active) dirty[tid] = true;
      });

      // Charts may mount after first paint — retry while still dirty
      if (!result && dirty[active] && retryCount < MAX_RETRIES) {
        retryCount += 1;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(function () {
          scheduleFit(active);
        }, 350);
      } else if (result) {
        retryCount = 0;
      }
    });
  }

  function requestFit(tabId) {
    var id = tabId || activeTabId();
    if (!TAB_CONFIG[id]) return;
    dirty[id] = true;
    if (id === activeTabId()) {
      scheduleFit(id);
    }
  }

  function onTabActivated(tabId) {
    if (!TAB_CONFIG[tabId]) return;
    dirty[tabId] = true;
    scheduleFit(tabId);
  }

  function onWindowResize() {
    Object.keys(TAB_CONFIG).forEach(function (tid) {
      dirty[tid] = true;
    });
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      scheduleFit(activeTabId());
    }, RESIZE_DEBOUNCE_MS);
  }

  function boot() {
    global.fitChartRowToViewport = fitChartRowToViewport;
    global.__requestViewportFit = requestFit;

    global.__onTabActivated = global.__onTabActivated || [];
    global.__onTabActivated.push(onTabActivated);

    window.addEventListener("resize", onWindowResize, { passive: true });

    var start = function () {
      dirty[activeTabId()] = true;
      scheduleFit(activeTabId());
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start).catch(start);
    } else {
      start();
    }

    // Dashboard / cann charts often finish after fonts; one delayed pass
    setTimeout(function () {
      requestFit(activeTabId());
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
