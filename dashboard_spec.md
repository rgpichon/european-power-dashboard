# European Energy Dashboard — Full Design & Data Specification
## Version 1.0 — July 2026

---

## 0. Core principles

- **Reliability over ambition.** Every chart must render correctly on first load with no broken states. If a data source is unreliable, use static fallback data with a visible "last updated" label. A working static chart is always better than a broken live one.
- **Legibility first.** Every chart should be understandable in under 10 seconds without reading the commentary. If it isn't, simplify the chart before adding explanation.
- **One claim per chart.** Each visual makes one argument. No chart tries to show three things simultaneously.
- **Static before interactive.** Build the static version of every chart first. Add hover tooltips and interactivity only once the static version is correct and clean.
- **Data as of label everywhere.** Every chart that uses external data shows a small "Data as of [date]" label. No exceptions.

---

## 1. Technology stack

| Component | Choice | Rationale |
|---|---|---|
| Charts | Plotly.js (CDN) | Handles all chart types needed, reliable hover, good map support |
| Maps | Plotly.js choropleth + scattergeo | Keeps stack to one library, avoids Leaflet complexity |
| Layout/nav | Vanilla HTML + CSS + JS | No framework overhead, faster load, easier to debug |
| Fonts | Inter (Google Fonts) | Clean, professional, highly legible at small sizes |
| Hosting | Self-hosted or GitHub Pages | Static HTML file, no server required |
| Data fetching | Fetch API with async/await | Simple, no dependencies, fallback to hardcoded data on error |

**No React, no build step, no bundler.** Single HTML file with embedded CSS and JS. Cursor can manage this cleanly and it loads fast.

---

## 2. Design system

### Colour palette
| Role | Hex | Usage |
|---|---|---|
| Background | #FAFAFA | Page background |
| Surface | #FFFFFF | Card/panel background |
| Border | #E5E7EB | Card borders, dividers |
| Text primary | #111827 | Headlines, body text |
| Text secondary | #6B7280 | Labels, captions, metadata |
| Accent blue | #1D4ED8 | Primary data series, links, active tab |
| Accent orange | #EA580C | Secondary data series, warnings, annotations |
| Accent green | #16A34A | Positive indicators, renewables data |
| Accent red | #DC2626 | Negative prices, covenant breach zones |
| Neutral grey | #9CA3AF | Inactive elements, gridlines |

### Typography
| Element | Style |
|---|---|
| Page title | Inter 28px, weight 700 |
| Section headline | Inter 20px, weight 600 |
| Chart title | Inter 14px, weight 600 |
| Body / commentary | Inter 15px, weight 400, line-height 1.6 |
| Labels / captions | Inter 12px, weight 400, colour: text secondary |
| Tab labels | Inter 13px, weight 500 |

### Layout
- Max content width: 1200px, centred
- Card padding: 24px
- Gap between cards: 20px
- Chart height: 380px default (maps: 500px, small summary charts: 240px)
- Mobile: single column, charts rescale via Plotly responsive mode

### Cards
Every chart lives in a white card with a subtle border and 4px border-radius. Card structure:
1. Chart title (top left)
2. Chart
3. One-line insight (bold, accent blue) — the single claim the chart makes
4. 2–3 sentence commentary below
5. "Data as of [date] · Source: [name]" caption (bottom right, text secondary)

Expandable panels use a simple "↓ Deeper analysis" toggle. When open, shows additional commentary and optionally a second chart.

---

## 3. Navigation structure

```
[ Dashboard ]  [ Gas & LNG ]  [ Cannibalisation ]  [ Interaction Model ]  [ Article ]
```

Fixed top navigation bar, sticky on scroll. Active tab highlighted with accent blue underline. Clean horizontal layout, no dropdown menus.

The **Dashboard** tab is the homepage — always the landing page.

---

## 4. Dashboard homepage

### Purpose
Someone landing here cold should understand the thesis in under 2 minutes. Four charts, one thesis statement at the top, no tabs required to get the argument.

### Thesis statement (top of page)
Short block of text, max 4 sentences:
> European electricity markets are structurally broken. Gas prices are collapsing toward the cost floor of US liquefaction as ~100 Mtpa of new capacity arrives by 2030 — yet renewable developers are simultaneously cannibalising their own revenues as penetration rises. The 2023 EU market reform left both dynamics unaddressed. The result is a market where neither gas nor renewables has durable pricing power, and where the project finance mathematics for new capacity is quietly deteriorating.

### Charts on homepage (4 total)

---

#### Chart H1 — LNG Supply Chain Map
**Title:** Global LNG supply chain — liquefaction, shipping, and European import terminals
**Type:** Plotly scattergeo — world map
**Claim:** European gas prices are set by global supply dynamics, not European ones
**What it shows:**
- Liquefaction terminals: dots sized by nameplate capacity (Mtpa), coloured by status (operational = blue, under construction = orange)
- Key shipping routes: curved lines, weighted by volume (US→NWE, Middle East→Europe, Middle East→Asia, Australia→Asia)
- European regasification terminals: distinct marker shape (diamond), coloured by utilisation rate
- Hormuz strait: annotated with a label
- Key chokepoints: Suez Canal, Panama Canal labelled

**Data source:** Static — from IGU World LNG Report 2026 notes (all values already in article notes)
**Data required (hardcoded):**

Liquefaction terminals (selected major ones):
| Terminal | Country | Capacity (Mtpa) | Status |
|---|---|---|---|
| Ras Laffan (Qatar) | Qatar | 77.1 | Operational (partial offline) |
| Sabine Pass | USA | 30.0 | Operational |
| Corpus Christi | USA | 15.0 | Operational |
| Plaquemines | USA | 20.0 | Ramping 2025 |
| Golden Pass | USA | 17.8 | First cargo Apr 2026 |
| CP2 LNG | USA | 14.4 | Under construction |
| Port Arthur P1 | USA | 13.0 | Under construction |
| Rio Grande P1 | USA | 17.6 | Under construction |
| Woodside Louisiana | USA | 16.5 | Under construction |
| LNG Canada T1+T2 | Canada | 14.0 | 2025/2026 |
| Gorgon | Australia | 15.6 | Operational |
| North West Shelf | Australia | 16.9 | Operational |
| Ichthys | Australia | 8.9 | Operational |
| Yamal LNG | Russia | 16.5 | Operational |
| NLNG | Nigeria | 22.2 | Operational (66% util) |
| Coral South FLNG | Mozambique | 3.4 | Operational |

European regasification terminals (selected):
| Terminal | Country | Capacity (Mtpa) |
|---|---|---|
| Gate Terminal | Netherlands | 12.0 |
| Eemshaven FSRU | Netherlands | 8.0 |
| Montoir | France | 10.0 |
| Fos Tonkin | France | 8.25 |
| Barcelona | Spain | 16.8 |
| Cartagena | Spain | 11.8 |
| Mugardos | Spain | 3.6 |
| Rovigo | Italy | 8.0 |
| Livorno | Italy | 3.75 |
| Piombino FSRU | Italy | 5.0 |
| Świnoujście | Poland | 6.2 |
| Krk FSRU | Croatia | 2.9 |
| Mukran (partial) | Germany | 5.0 |
| Brunsbüttel FSRU | Germany | 5.0 |
| Deutsche ReGas | Germany | 4.5 |

Shipping routes (lat/lon pairs for arc lines):
- US Gulf Coast → Rotterdam
- US Gulf Coast → UK (Isle of Grain)
- Qatar → Rotterdam (via Suez or Cape)
- Qatar → Japan (via Hormuz)
- Australia → Japan
- Australia → China

**Expandable panel:** Full value chain diagram (static SVG or simple HTML diagram) — upstream → liquefaction → shipping → regasification → grid. With key cost nodes annotated (Henry Hub, liquefaction toll, shipping, TTF).

---

#### Chart H2 — TTF Forward Curve
**Title:** TTF natural gas forward curve — the market has priced the supply wave
**Type:** Plotly line chart
**Claim:** Summer 2029–30 TTF at €21–25/MWh is within the US Gulf Coast SRMC floor — the market has priced in cheap gas, but not what it does to electricity markets
**What it shows:**
- Full forward curve Jul 2026 → Dec 2030 (monthly contracts)
- X-axis: date, Y-axis: €/MWh
- Two vertical annotations: "Hormuz premium fades" (Mar→Apr 2027 cliff) and "US supply wave arrives" (Mar→Apr 2028 cliff)
- Horizontal shaded band: US Gulf Coast SRMC floor range €15–22/MWh (light orange fill, labelled)
- Current spot labelled with a dot and annotation

**Data source:** Static — ICE forward curve as of 17 July 2026 (full monthly data in article notes update file)
**Data required:** All values in `article_notes_update_ttf_forward_curve.md` — complete, no additional sourcing needed

**Expandable panel:** Seasonal spread chart (winter premium over summer by year 2027–2030), showing compression from ~€13 to ~€3. Commentary on heat pump penetration eroding heating demand seasonality.

---

#### Chart H3 — Negative Price Hours Acceleration
**Title:** Negative electricity price hours by country, 2023–2025
**Type:** Plotly grouped bar chart
**Claim:** Negative price hours are accelerating at 25–50% per year — cannibalisation is not a future risk, it is happening now
**What it shows:**
- Countries: Germany, Netherlands, Spain, France, Belgium
- Three bars per country: 2023, 2024, 2025
- Y-axis: hours per year
- Colour: 2023 light blue, 2024 mid blue, 2025 accent blue
- % YoY change labelled on 2025 bars

**Data source:** Static — all values in article notes Section 3.3
**Data required:**
| Country | 2023 | 2024 | 2025 |
|---|---|---|---|
| Germany | 457 | 459 | 570 |
| Netherlands | 316 | 458 | 584 |
| Spain | 0 | 247 | 500 |
| France | 147 | ~200 | ~290 |
| Belgium | 222 | 404 | 450 |

Note: France and Belgium 2023 are estimates from "doubled YoY" references — flag with asterisk and note in caption.

**Expandable panel:** Seasonality chart — % of negative price hours occurring in May/June (47% in 2025). Commentary on solar cannibalisation peaking in spring/summer. Aurora 2030 forecast (Germany 5–10% of annual hours).

---

#### Chart H4 — DSCR Cliff
**Title:** Offshore wind project finance — the bankability cliff
**Type:** Plotly line + shaded area chart
**Claim:** At 62% renewable penetration, a reference offshore wind project earns near-zero equity return — the DSCR cliff has arrived in live market pricing
**What it shows:**
- X-axis: renewable penetration % (35% to 70%+)
- Left Y-axis: DSCR (line, accent blue)
- Right Y-axis: equity IRR % (line, accent orange)
- Horizontal shaded bands:
  - Red zone: DSCR < 1.15 (covenant lock-up threshold)
  - Dark red zone: DSCR < 1.0 (technical default)
- Vertical annotation at 62%: "Spain actual 2025 (MVF 0.61)"
- Data points from DSCR table in notes

**Data source:** Static — DSCR table from article notes Section 3.8
**Data required:**
| Penetration | MVF | Captured price | DSCR | Equity IRR |
|---|---|---|---|---|
| 35% | 0.90 | €74 | 3.3 | 15% |
| 50% | 0.75 | €60 | 2.6 | 10% |
| 62% | 0.62 | €42 | 1.65 | ~0% |
| 65% | 0.55 | €37 | 1.45 | negative |
| 70% | 0.45 | €30 | 1.1 | negative |

**Expandable panel:** PPA price vs breakeven chart — onshore wind PPA Europe blended (€52.75, LevelTen Q3 2025) vs German breakeven (€78/MWh), solar PPA (€35) vs long-run cost floor. Simple bar or dot chart. Commentary on auction failures.

---

## 5. Gas & LNG tab

### Purpose
Full depth on the LNG market, TTF formation, supply wave, spark spread mechanics, and who holds the risk. The LNG map from the dashboard appears here again at full width.

### Sections and charts

**5.1 LNG value chain** (expandable panel, not a full chart)
Static HTML diagram: Upstream → Liquefaction → Shipping → Regasification → Wholesale (TTF) → Power generation. Each node annotated with: key players, cost range, key data point. Clean CSS-based diagram, no library needed.

**5.2 Supply wave timeline**
- **Type:** Plotly horizontal bar / Gantt-style chart
- **Title:** Sanctioned LNG capacity additions 2025–2030 — ~100 Mtpa arriving regardless of demand
- **What it shows:** Each FID project as a horizontal bar, start year to ramp completion, sized by Mtpa, coloured by country (US = blue, Canada = teal, Qatar = orange, other = grey). Cumulative capacity line on secondary axis.
- **Data:** Full project table from article notes Section 2.3 (all FID projects listed)
- **Claim:** Every project shown has already taken FID — this supply is coming regardless of price

**5.3 TTF forward curve** (same as H2, full width version with more annotation)
Add: historical TTF 2022–2026 as context (static, from public sources or hardcoded key points), so the forward curve reads as continuation of recent history not standalone.

**Historical TTF data needed (approximate annual averages, hardcoded):**
| Year | Avg TTF (€/MWh) |
|---|---|
| 2021 | ~16 |
| 2022 | ~131 (crisis peak) |
| 2023 | ~40 |
| 2024 | ~34 |
| 2025 | ~42 |
| 2026 H1 | ~42 |
| 2026 spot | ~52 (Hormuz) |

**5.4 JKM/TTF spread history**
- **Type:** Plotly line chart
- **Title:** JKM vs TTF — when the spread inverts, Atlantic cargoes go to Europe
- **What it shows:** Monthly JKM and TTF averages 2022–2025, spread as shaded area between the two lines. Annotate: 2025 average spread (−$0.71, meaning Europe was cheaper than Asia), Hormuz spike March 2026 (JKM peak $25.41)
- **Data source:** Static — key data points from IGU 2026 notes. Monthly granularity for 2024–2025 may need supplementing; use quarterly averages if monthly unavailable
- **Key hardcoded points:** JKM 2025 avg $12.16, TTF 2025 avg ~$11.9, Hormuz spike JKM $25.41 on 19 March 2026

**5.5 European LNG imports — origin breakdown**
- **Type:** Plotly stacked bar chart, annual 2022–2025
- **Title:** Europe absorbed the global LNG surplus — US share rose from X% to 58.5% in 2025
- **Data:** From IGU 2026 notes — 2025: total 126.2 Mt, US 73.8 Mt (58.5%), Middle East 9.1 Mt, others by difference. For 2022–2024, use approximate figures or source from ENTSO-G/GIE if available via API.
- **Free API:** GIE AGSI+ (https://agsi.gie.eu/api) provides European gas storage and import data — worth checking if LNG import origin data is available. If not, hardcode 2022–2025 from IGU report.

**5.6 Spark spread mechanics** (expandable panel)
Not a chart — a clean HTML table showing: at different TTF levels (€22, €35, €52), the gas CCGT variable cost, the implied electricity price needed to cover it, and the spark spread at current electricity prices. Uses the electricity price implications table from the TTF notes update.

**5.7 Regasification utilisation**
- **Type:** Plotly bar chart, simple
- **Title:** Global regasification capacity: 1,113.5 Mtpa built, 39.2% used
- **What it shows:** Capacity vs utilisation by major region (Europe, Asia-Pacific, Americas, Middle East/Africa). Simple two-bar per region (capacity, utilised volume).
- **Data:** Static from IGU 2026 notes. Total global: 1,113.5 Mtpa, 39.2% utilisation.

---

## 6. Cannibalisation tab

### Purpose
Full cannibalisation argument: merit order → load duration curve → negative prices → MVF → PPA → DSCR → P90 → CfD limits.

### Sections and charts

**6.1 European renewables map**
- **Type:** Plotly choropleth — Europe
- **Title:** Renewable penetration and capture rate deterioration by country
- **What it shows:** Country fill = renewable penetration % (2025). Overlaid markers = volume-weighted average solar/wind capture rate (where data available). Tooltip shows: penetration %, negative price hours 2025, PPA blended price.
- **Countries/data needed:**
  | Country | Penetration est. | Negative hours 2025 | Notes |
  |---|---|---|---|
  | Germany | ~55–60% | 570 | MVF solar ~0.85 |
  | Spain | ~60–65% | 500+ | MVF solar 0.61 |
  | Denmark | ~80%+ | high | Offshore dominant |
  | Portugal | ~65% | moderate | |
  | Netherlands | ~35–40% | 584 | |
  | France | ~25–30% (nuclear dominant) | ~290 | |
  | UK | ~40–45% | moderate | |
  | Italy | ~40% | moderate | |
- **Data source:** Mix of ENTSO-E (penetration) and article notes (negative hours, MVF). Some values will need estimating — flag with asterisk.
- **Free API:** ENTSO-E Transparency Platform (https://transparency.entsoe.eu/api) — generation by type, allows penetration calculation. Requires free API key registration.

**6.2 Load duration curve — Germany and France**
- **Type:** Plotly line chart
- **Title:** The demand compression signal — summer hours increasingly fall below 55% of annual peak
- **What it shows:** Ranked load duration curves for Germany and France, 2024 vs 2025. X-axis: hours ranked 1–8760. Y-axis: MW. Show the summer compression visually — the left portion of the curve (highest demand) stays similar, the right portion (lowest demand) moves down year-on-year.
- **Data source:** ENTSO-E hourly load data already in `/mnt/user-data/uploads/entose_hourly_data_2024-26.xlsx` — already analysed, key statistics in article notes. For the chart, will need to re-process the raw hourly data to create ranked load duration arrays.
- **Key annotations:** Horizontal line at 55% of annual peak. Label "France: 85.1% of summer 2025 hours below this line."

**6.3 Negative price hours — country heatmap**
- **Type:** Plotly heatmap
- **Title:** Negative electricity price hours — accelerating across all major markets
- **What it shows:** Countries on Y-axis, years (2022–2025) on X-axis, colour = hours per year (white → deep red). Immediately shows both the scale and the acceleration.
- **Data:** Static from article notes Section 3.3

**6.4 MVF / capture rate decay**
- **Type:** Plotly line chart
- **Title:** The cannibalisation curve — market value factor decays as penetration rises (Hirth 2013, updated with live data)
- **What it shows:** 
  - Hirth (2013) theoretical curve: MVF vs penetration % for wind (line)
  - Overlaid empirical data points: Germany solar 2025 (MVF ~0.85 at ~58% penetration), Spain solar 2025 (MVF 0.61 at ~62%), Spain solar April 2024 (MVF 0.40 at ~63%), German offshore wind 2025 (MVF 0.95)
  - Aurora 2030 forecast points
- **Data:** Static from article notes Section 3.4
- **Claim:** Empirical data is tracking at or below the Hirth lower bound

**6.5 PPA prices vs breakeven**
- **Type:** Plotly dot/bar chart
- **Title:** PPA prices have fallen below long-run cost — the market is telling you cannibalisation has arrived
- **What it shows:** 
  - Current PPA prices: solar Europe blended (€35), onshore wind Europe blended (€52.75), offshore wind Germany (€88)
  - Breakeven costs: solar (~€45–50), onshore wind Germany (€78), offshore wind Germany (~€85–90)
  - Gap between price and breakeven shown as red arrow/bar
- **Data:** Static from article notes Section 3.5

**6.6 DSCR cliff** (same as H4, full width with more annotation)
Add: P90 blind spot explanation as expandable panel below. The concrete numerical example (2021 underwrite at €85/MWh → year 12 realised €45.5/MWh despite hitting P90 yield target) rendered as a simple comparison visual.

---

## 7. Interaction model tab

### Purpose
The quantitative centrepiece showing how the two channels (direct cannibalisation + indirect TTF suppression) compound. **Built last, after UniCredit calibration.**

### Placeholder for v1
Simple text card: "Interaction model — coming [month] 2026. This section will show the combined effect of renewable penetration and TTF levels on electricity prices, spark spreads, and project finance returns."

### Planned charts (for later build)

**7.1 Penetration × TTF heatmap**
- X-axis: renewable penetration % (35% to 70%)
- Y-axis: TTF level €/MWh (€15 to €55)
- Colour: resulting average electricity price €/MWh
- Overlay contour lines showing DSCR = 1.15 (covenant trigger) and DSCR = 1.0 (default)
- User can toggle between: electricity price view / DSCR view / spark spread view

**7.2 Scenario comparison**
- Three scenarios: Base (TTF €35, penetration 55%), Bear (TTF €22, penetration 65%), Bull (TTF €45, penetration 45%)
- Bar chart comparison: electricity price, captured renewable price, gas plant net profit/MW, offshore wind DSCR

**7.3 Gas plant economics model**
- Interactive: user adjusts TTF slider and running hours slider
- Output: variable profit/MW, fixed cost coverage, net economic profit, years to stranded asset

---

## 8. Article tab

### Purpose
Full written article readable within the dashboard. Charts from other tabs appear inline as smaller embedded versions. Expandable sections for deeper analysis.

### Structure
- Article renders as clean long-form text, max width 720px, centred
- Section headers with anchor links (so the tab nav can deep-link to sections)
- Each chart reference in the text has an inline embed — same Plotly chart, smaller height (240px), with a "↗ View full chart" link that opens the full tab
- Expandable `<details>` elements for: full DSCR table, full supply wave table, P90 numerical example, full JKM/TTF trading mechanics

### Sections
1. How the European Electricity Market Works
2. Gas and LNG: Pricing Power and Its Limits
3. Renewables: The Cannibalisation Problem
4. The Interaction Model *(placeholder until built)*
5. Conclusion and Trade Idea

---

## 9. Data sourcing summary

| Chart | Source | Type | API available |
|---|---|---|---|
| LNG supply chain map | IGU 2026 + article notes | Static hardcoded | No |
| TTF forward curve | ICE via article notes update | Static hardcoded | ICE requires subscription; use static |
| TTF historical | Various public sources | Static hardcoded key points | No free API for clean historical |
| Negative price hours | Article notes (IEA/Aurora/EPEX) | Static hardcoded | ENTSO-E API (generation data proxy) |
| JKM/TTF spread | Article notes + IGU 2026 | Static hardcoded | No free API for JKM |
| European LNG imports | IGU 2026 + GIE AGSI+ | Static + optional API | GIE AGSI+ free API |
| Regasification utilisation | IGU 2026 | Static hardcoded | No |
| Supply wave timeline | Article notes Section 2.3 | Static hardcoded | No |
| ENTSO-E load duration curves | `/mnt/user-data/uploads/entose_hourly_data_2024-26.xlsx` | Local data | ENTSO-E Transparency API (free, needs key) |
| Renewables penetration map | ENTSO-E API + article notes | API + static | ENTSO-E Transparency API |
| MVF / capture rates | Article notes (Veyt/Aurora/Hirth) | Static hardcoded | No |
| PPA prices | Article notes (LevelTen/Veyt) | Static hardcoded | No |
| DSCR cliff | Article notes Section 3.8 | Static hardcoded | No |
| European storage (live) | GIE AGSI+ | API | https://agsi.gie.eu/api — free |

### Free APIs to integrate
1. **GIE AGSI+** (https://agsi.gie.eu/api) — European gas storage levels. Free, no key required for basic queries. Use for: storage fill % by country, useful context widget in Gas & LNG tab.
2. **ENTSO-E Transparency Platform** (https://transparency.entsoe.eu/api) — generation by fuel type, load data. Free, requires registration for API key. Use for: renewable penetration by country (live), load duration curve data.
3. **EIA API** (https://api.eia.gov) — US LNG export data. Free, requires free API key. Use for: US LNG export volumes by destination, useful for supply wave section.

### Fallback rule
Every API call must have a hardcoded fallback. If the API fails or is slow, display the hardcoded data with "Live data unavailable — showing data as of [date]." Never show a broken/empty chart.

---

## 10. Build sequence (recommended order in Cursor)

1. **HTML shell + navigation** — tab structure, design system (fonts, colours, card components), responsive layout. No charts yet. Verify it looks right.
2. **Dashboard homepage** — four charts in static form (all hardcoded data). Get these pixel-perfect before moving on.
3. **Gas & LNG tab** — supply wave Gantt, TTF curve full version, JKM/TTF spread, LNG imports bar chart, regasification utilisation. All static.
4. **Cannibalisation tab** — renewables map (static choropleth first), negative price heatmap, MVF curve, PPA vs breakeven, DSCR cliff. Load duration curves from ENTSO-E data file.
5. **Article tab** — embed article text (placeholder sections for now), wire up inline chart embeds.
6. **API integration** — add GIE AGSI+ storage widget, ENTSO-E live penetration data, EIA LNG export data. Each as an enhancement to existing static charts, not a replacement.
7. **Interaction model tab** — built last, after UniCredit calibration (August–September).
8. **Polish pass** — hover tooltips, mobile responsiveness, "data as of" labels, source citations, loading states.

---

## 11. Out of scope for v1

- User authentication or personalisation
- Download/export functionality for charts
- Comment or sharing functionality  
- Real-time TTF or JKM price feeds (ICE/CME require subscriptions)
- Animated cargo routing (nice to have, added only if build time allows)
- Dark mode
