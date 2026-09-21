# European Power Dashboard

An interactive companion to the research piece "Neither gas nor renewables retains durable pricing power in European electricity markets." The dashboard lets a reader test the article's central claim directly: it models how renewable buildout and gas price dynamics jointly determine which technology sets the German wholesale electricity price hour by hour, and what that means for financing a merchant gas plant.

Six tabs: a live pricing engine (Interaction Model), the market mechanics behind it (Gas & LNG, Cannibalisation), a full project-finance model for a 500MW merchant CCGT (Plant Economics), a takeaways summary, and the full article.

## Stack

This is a static site — one `index.html` shell plus ES modules, with no React/Vue bundler and no application server. Charts and the Europe/LNG map use **Plotly.js**; the Interaction Model's Excel export uses **SheetJS**. Typography is Inter via Google Fonts. Shared presentation helpers live in `plotly-theme.js`, `data-colors.js`, `chart-data.js`, `combined-map.js`, and `viewport-fit.js`.

The pricing engine is `im_engine/scenarioEngine.js`. On load it pulls the calibrated JSON pack from `im_data/` (`loadDataFromUrls`), then `runScenario` recomputes when the reader moves the scrubbers: season×block cells collapse into three hour-states (gas-setting, zero/negative, residual) and a demand-weighted German wholesale price. That same scrubber state feeds the Dashboard mirrors and the electricity path used by Plant Economics.

Plant Economics is a browser port of the audited workbook `Gas_Plant_v17.xlsx`, implemented in `plantEconomicsEngine.js` and wired through `plant-economics-ui.js` — DSCR sculpting, NOL carryforward, construction vs already-operating, and live sensitivities, priced off the Interaction Model rather than a separate price deck. Offline, `scripts/verify_v17_year_levels.mjs` checks year-level JS outputs against Excel dumps; **Playwright** prints `takeaways-slides.html` to the public PDF in `downloads/takeaways.pdf`. Production is a no-build **Vercel** static deploy (with `.vercelignore` keeping local scratch out of the public tree).

- **Financial model:** `Gas_Plant_v17.xlsx` — a full project-finance build for a 500MW merchant gas CCGT: three-statement integrity, DSCR sculpting with a terminal balloon, NOL carryforward, phased construction financing with capitalized interest, and six live sensitivity tables.
- **Design:** UI and visual design direction by Claude (Anthropic).
