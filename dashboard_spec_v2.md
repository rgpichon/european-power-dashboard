# European Energy Dashboard — design spec v2
Locked 19 July 2026. Supersedes dashboard_spec.md for the Dashboard tab; other tabs unchanged and reaffirmed below.

## 1. Design system (unchanged, applies everywhere)
- Background: #FAFAFA · Surface: #FFFFFF · Accent blue: #1D4ED8 · Accent orange: #EA580C
- Font: Inter · body 15px/1.6 · chart titles 14px/600
- Cards: white, 0.5px border, 4px border-radius, 24px padding
- Standard chart height: 300px (half-width charts on Gas & LNG / Cannibalisation)
- Section padding: 32px on Dashboard, 60px on other tabs
- Text panels (Gas & LNG / Cannibalisation only): bold claim title (max 8 words) + 4–5 sentences at 14px/1.7

## 2. Dashboard tab — full redesign

### Philosophy
Front page, not a compressed copy of the other tabs. Job is to state the thesis and route the reader into Gas & LNG, Cannibalisation, or Financing — not repeat their content. No standalone text-commentary panels anywhere on this tab; text is limited to headlines, one-line deks, and one-line chart captions.

### Fold 1 — thesis (~1 viewport at 1280px)
1. **Masthead**: tab nav (existing) + "Data as of [date]" right-aligned, 11px muted.
2. **Hero headline + dek**, full width: 22–23px/700 headline stating the thesis as a claim (not the current blue alert-box banner — remove the box treatment entirely). One-line 14px dek beneath, max ~20 words.
3. **Map + cards row**, two columns:
   - Left (~55%): combined map — renewable penetration choropleth of Europe (muted fill, no borders) as base layer, LNG shipping routes from Qatar/US Gulf drawn as solid dark/orange arcs on top. This is the single visual carrying both halves of the thesis. Build as an isolated component first and confirm it renders before wiring into the row — this is the highest-risk piece technically.
   - Right (~45%): two stacked cards, one per remaining pillar (Cannibalisation, Financing). Each: small uppercase eyebrow label (color-coded to pillar), one bold headline sentence (14–15px/700), one small sparkline (no axes, no legend), no caption paragraph.
   - No fourth "Gas & LNG" card — the map already carries that pillar.
4. **Ticker strip**: single row, horizontal, no card wrapper — 4–5 inline stats (label + bold value), small font (11px), no color unless the number is genuinely a stress signal (orange).
5. No standalone stat-box grid above the map — removed; the ticker strip is the only "quick numbers" element on fold 1.

### Fold 2 — the numbers (~1 viewport at 1280px)
1. Thin visual divider from fold 1 (light rule or muted "scroll for the underlying charts" label, 11px, centered).
2. **Two charts, real data, standard 300px height**, using the existing "two equal charts, main left / secondary right" pattern from the design system — no new grid format introduced: TTF forward curve (main, left) and negative price hours by country (secondary, right). Each chart gets a title (14px/600) and a one-line source/data-as-of caption (11px, muted) only — no commentary text. DSCR cliff is deliberately not repeated here — it already appears as the Financing card's sparkline in fold 1 and gets its full treatment on the Cannibalisation tab; a third appearance here would just re-duplicate it. It gets a proper full home later on the Interaction Model or Conclusion tab.
3. **Numbers band below the chart row**: 6–8 compact stat tiles (not the ticker style — small cards, similar to fold-1 ticker's data set but expanded): global LNG capacity, DE/NL/ES negative price hours, Spanish MVF low, onshore wind PPA vs breakeven, France summer sub-55%-peak share. Terminal-style: label above, bold number below, no charts.
4. Nothing beyond this — no third chart, no additional commentary section. If the reader wants more, that's what the other tabs are for.

### Explicitly removed from the old Dashboard tab
- Full-width standalone LNG map (folded into the combined map above)
- All standalone text-commentary cards
- The old "headline numbers" stat grid as a separate section (merged into fold 2's numbers band)

## 3. Tab structure — revised, standalone "Article" tab removed
Four tabs total: Dashboard, Gas & LNG, Cannibalisation, Interaction Model. No separate Article tab — the written research article becomes a standalone external deliverable (proper research-paper formatting, not a LinkedIn post; a short teaser post on LinkedIn links out to it). The interface's job is the in-depth, illustrated version of the story, not a copy of the article.

Section mapping: Gas & LNG and Cannibalisation each become article-style deep dives (see section 4 below) carrying the corresponding article sections' prose in full depth. Market mechanics, the interaction model itself, and the conclusion/trade idea all live inside the Interaction Model tab, in that order — no separate Mechanics tab. Appendices (gas plant economics, P90 numerical example) become expandable panels at the bottom of their relevant tab (Gas & LNG and Cannibalisation respectively) rather than living in a standalone article tab. References become a single lightweight expandable "Sources" panel reachable from any tab, not repeated per tab.

## 4. Gas & LNG and Cannibalisation tabs — full redesign: article-style, not chart-row grid

### Philosophy
These tabs stop being a repeated chart-left/text-right grid and become flowing long-form essays with embedded charts — closer to an FT data-journalism piece than a dashboard. Each tab must work as a standalone read (someone landing here directly, without having read Dashboard or Interaction Model first, should still follow the argument) while also reading naturally in sequence Dashboard → Gas & LNG → Cannibalisation → Interaction Model.

### Layout
- **Centered column, not full width.** FT-style: a reading column (~560–600px) centered in the page with real margins on both sides — never stretched to fill the container.
- **Faded section list, left-aligned, not a dropdown.** A persistent but muted list of subsections sits to the left of the centered column — low-contrast gray text, with the current section picked out in accent blue. It should recede visually until someone looks for it; it is not a prominent nav control.
- **Standalone-readability recap**: each tab opens with a short (2–3 sentence, muted gray, smaller font) recap paragraph giving the minimum context needed if arriving without prior tabs, before the real headline prose begins.
- **Headline + flowing prose**: real paragraphs at 15px/1.7, no fixed-height text cards, no forced sentence counts. Length follows the argument, not a container.
- **Charts sized by editorial importance, not uniform 300px**:
  - *Hero figures* — full column width, ~350–400px tall, used for the one or two charts that carry the section's core claim. Gas & LNG: LNG value chain diagram, TTF forward curve. Cannibalisation: renewables choropleth (opening context), MVF decay curve (the core empirical mechanism — this is the single chart that visualises cannibalisation directly, so it outranks the heatmap for hero treatment).
  - *Minor figures* — smaller (roughly 40% column width), paired chart-left/text-right with supporting prose alongside, for charts that support rather than carry the argument. Gas & LNG: JKM/TTF spread, EU LNG imports, regasification utilisation. Cannibalisation: negative price hours heatmap, PPA prices vs breakeven, DSCR cliff, load duration curve.
  - All figures get a one-line italic caption (source, data-as-of) beneath — never a bordered stat-card treatment.
- **Expandable appendix panel** at the bottom of each tab (gas plant economics for Gas & LNG; P90 numerical example for Cannibalisation), collapsed by default.

### Depth strategy — targeted "go deeper" panels, not blanket expansion
The existing article prose (~1,950 words for Gas & LNG, ~2,100 for Cannibalisation) is already full FT-length depth and should not be padded to "feel thorough" — that would work against the restraint the layout depends on. Instead, depth is added surgically: small collapsed-by-default panels inserted at specific points in the flow, used only where there is genuinely more to say that would clutter the main argument inline — methodology detail (e.g. how MVF is actually calculated), sensitivity/counterfactual analysis, a supporting data table, or a contested framing worth flagging separately. These sit alongside the two larger appendix panels (gas plant economics, P90 example), not instead of them. The main narrative column stays close to its current length as the primary read; panels are for the reader who wants to go further, not a repository for filler.

## 5. Interaction Model tab — expanded scope
Carries market mechanics (merit order, gas CCGT pricing formula, day-ahead auction mechanics, the three structural tensions), the interaction model itself, and the conclusion/trade idea, in that order, once built. Same article-style layout as Gas & LNG / Cannibalisation (centered column, faded section list, hero/minor chart sizing). Build after UniCredit calibration, August–September 2026 — currently still a placeholder.

## 6. Known technical issues to fix regardless of layout changes
- Plotly fallback ("chart library failed to load") is currently showing across all three tabs in the latest screenshot — this is a regression from the last fix round and needs to be re-resolved before or alongside the Dashboard rebuild.
- Combined map (fold 1) is the highest build-risk item — isolate and verify before integrating.
