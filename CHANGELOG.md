# Dashboard changelog

## 2026-09-14 — Plant Economics scope & Excel alignment

### Deliberate scope reduction: PPA split removed

Plant Economics no longer models a contracted PPA share. The PE panel controls (`PPA share`, `PPA price`) and all engine paths that split generation into PPA vs merchant are **removed**, not hidden. The plant is **100% merchant**: physical-max MWh are available only to state-based dispatch (gas-setting / residual when price ≥ plant SRMC; negative-price hours idle).

- **Why:** Excel has no PPA structure; the dual merchant/PPA model was a dashboard-only extension. Keeping it invited stale UI assumptions and a download bake that could never round-trip to the workbook.
- **Audited feature note:** PPA split was previously part of the PE engine’s audited surface (revenue = PPA lock + merchant state revenue). Removing it is a **deliberate scope reduction**, not a silent default to `ppaShare = 0`.
- **“Not bankable” narrative:** Unaffected. Default was already `ppaShare = 0`; verdict logic keys off min DSCR / equity NPV / IRR only — it never depended on a non-zero PPA. Article/cannibalisation PPA prose (corporate offtake markets) is unrelated and unchanged.

### Excel download — COD year excluded from cell writes

When the download feature is built, **do not write COD** to the workbook:

| UI | Was proposed | Decision |
|----|--------------|----------|
| COD year (`pe-cod-year`) | `Ass.!D10` + `Ass.!D25` | **Excluded** — template keeps its own COD defaults |

Ass.!D10 (degradation start) and Ass.!D25 (repayment start) are two Excel cells for one dashboard concept; syncing both on every download adds fragility for little benefit. COD remains fully adjustable in the **JS-only** dashboard; export leaves the template COD alone.

Planned write list (price + plant inputs), **without COD**:

- `IM Price Import!A30:J65` (+ stamp cells) — scrubber path
- `Scen. & Sensi.!G7` capacity · `G8` efficiency · `G9` availability · `G10` degradation · `G11` capex · `G12` gearing · `G13` debt margin · `G14` tenor · `G16` DSCR · `G18` Ke · `G19` fixed O&M · `G20` var O&M · `G21` overhaul cost · `G22` overhaul interval · `G23` tax
- `Ass.!D43` useful life; Euribor curve fill TBD (`Ass.!J46:AQ46`)
- **Not written:** Ass.!D10, Ass.!D25, PPA (none in Excel), efficiency floor (`Scen.!G24` unused by Ops — see below)

### Efficiency floor removed; degradation matches Excel Ops

**Excel mechanism** (`Gas_Plant_v11_plant running hours switched.xlsx`):

- `Ops.!J11` (and across years): `=IF(year < Ass!$D$10, 0, Ass!$D$9)` — annual degradation rate `d_t` is Ass.!D9 once calendar year ≥ degradation start, else 0.
- `Ops.!J13` (first path year): `=Ass.!D7*(1-J$11)` — efficiency starts as nameplate × (1 − d).
- Later years: `η_t = η_{t−1} × (1 − d_t)` (e.g. `K13 = J13*(1-K11)`).
- **No floor in Ops.** `Scen. & Sensi.!G24` is labeled “Efficiency floor (% of nameplate)” but is **not referenced** by Ops efficiency formulas (dead scenario cell).

PE engine now mirrors that compounding with **no floor**. Default `degradationRate` is **0.005** (Excel `Scen.!G10` / Ass.!D9), replacing the prior dashboard default of 0.01. Eff-floor UI control removed.
