# Excel download — cell write map (v11)

Template: `Excel_model/Gas_Plant_v11_plant running hours switched.xlsx`

Status: design list for the not-yet-built download button. Surgical ZIP/XML patch preferred over full ExcelJS rewrite (charts / DataTableFormula).

## Explicitly excluded

| Control | Reason |
|---------|--------|
| **COD year** (`pe-cod-year`) | Do **not** write `Ass.!D10` or `Ass.!D25`. Template COD stays; dashboard COD is JS-only. |
| PPA share / price | Removed from PE; Excel has no PPA cells. |
| Efficiency floor | Removed from PE; Excel `Scen.!G24` unused by Ops. |

## Price path (IM scrubber)

| Target | Content |
|--------|---------|
| `IM Price Import!A30:J65` | year, ttf, eua, srmc, P_gas, P_res, avg_elec, S_gas, S_res, S_neg |
| Stamp cells (`B4`/`B5`, optional) | scrubber JSON / timestamp |

## Plant Economics → Scen / Ass

| PE UI | Write cell |
|-------|------------|
| Capacity | `Scen. & Sensi.!G7` |
| Efficiency | `G8` |
| Availability | `G9` |
| Degradation | `G10` |
| Capex/MW | `G11` |
| Leverage | `G12` |
| Debt margin | `G13` |
| Tenor | `G14` |
| DSCR floor | `G16` |
| Cost of equity | `G18` |
| Fixed O&M | `G19` (€/MW-yr = UI €/kW-yr × 1000) |
| Var O&M | `G20` |
| Overhaul cost | `G21` |
| Overhaul interval | `G22` |
| Tax | `G23` |
| Useful life | `Ass.!D43` |
| Euribor | TBD flat-fill `Ass.!J46:AQ46` |
