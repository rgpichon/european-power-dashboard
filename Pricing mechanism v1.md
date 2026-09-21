# Pricing mechanism v1

Defendable day-ahead price construction for Germany (DE_LU), using short-period renewable intensity and gas economics. Not a full merit-order dispatch and not auction-perfect — directionally correct and roughly in range.

**Clean-year score (2019, 2023–25):** MAE ≈ €13/MWh; ~71% of blocks within ±€15.

---

## 1. Raw inputs

| Source | Resolution | Role |
|--------|------------|------|
| ENTSO-E day-ahead price (DE) | Hourly | Actual market price to match / validate |
| ENTSO-E generation by type | 15‑min → hourly MW | Solar, wind on/offshore, total gen |
| ICE TTF gas | Daily → hourly | Fuel leg of gas cost |
| Carbon (EUA futures) | Daily → hourly | CO₂ leg of gas cost |

Annual Ember penetration is **not** used in the pricing engine.

---

## 2. Built every hour

### Gas SRMC (mechanistic)

\[
\mathrm{SRMC}_h = \frac{\mathrm{TTF}_h}{\eta} + \mathrm{EUA}_h \times \frac{\mathrm{EF}}{\eta}
\]

Efficiency \(\eta\) is stepwise by era (same schedule as `gas_price_setting_share.py`).

### Flags

- **Gas-setting:** \(|P_h - \mathrm{SRMC}_h| \le 15\% \times \mathrm{SRMC}_h\)
- **Negative:** \(P_h \le 0\)

### Renewable intensity

\[
\text{tech share}_h = \frac{\text{tech MW}_h}{\text{total gen MW}_h}
\]

Kept separately: `solar_share`, `wind_onshore_share`, `wind_offshore_share`, and `vre_share` (sum of the three).

---

## 3. Grain: 4 blocks per day

Each calendar day (Europe/Brussels) is split into:

| Block | Clock hours |
|-------|-------------|
| Night | 00–06 |
| Morning | 06–12 |
| Afternoon | 12–18 |
| Evening | 18–24 |

Within a block (energy-weighted shares; mean price / SRMC):

- technology shares + `vre_share`
- `da_price_mean`, `srmc_mean`
- `gas_setting_share` = fraction of hours gas-setting
- `negative_share` = fraction of hours negative
- `residual_share` = \(1 - s_{\mathrm{gas}} - s_{\mathrm{neg}}\)

**Output:** `entsoe-pipeline/data/out/vre_block_panel_DE_LU.csv` (~11k blocks, Oct 2018 → mid‑2026).

---

## 4. VRE bins (10 pp)

Each block’s `vre_share` maps to a bin: 0–10%, 10–20%, …, 80–90%, 90–100+.

The same calendar day can sit in different bins (e.g. August night vs August afternoon).

---

## 5. Calibrated plugs (clean years only)

Clean years: **2019, 2023, 2024, 2025** (crisis 2020–22 excluded from calibration; incomplete years excluded).

### A. \(P_{\mathrm{neg}}(\mathrm{bin})\) — empirical

Among hours with \(P \le 0\) whose parent block is in that VRE bin:

- lock **median** of those day-ahead prices
- if too few negative hours in the bin → use **0**

No fixed stylised negative price (e.g. −10). Same “read from data” philosophy as \(\delta\).

### B. \(\delta(\mathrm{bin})\) — residual wedge

For blocks with residual weight \(s_{\mathrm{res}} \ge 0.10\), back-solve:

\[
\delta = \frac{P_{\mathrm{actual}} - s_{\mathrm{gas}}\,\mathrm{SRMC} - s_{\mathrm{neg}}\,P_{\mathrm{neg}}}{s_{\mathrm{res}}} - \mathrm{SRMC}
\]

Lock **median** \(\delta\) per VRE bin.

- Low VRE → \(\delta > 0\) (scarcity uplift vs SRMC)
- High VRE → \(\delta < 0\) (surplus discount vs SRMC)

**Output:** `entsoe-pipeline/data/out/delta_by_vre_bin.csv`

---

## 6. Model price (Module 3)

For each block:

\[
P_{\mathrm{model}} =
s_{\mathrm{gas}}\cdot\mathrm{SRMC}
+ s_{\mathrm{neg}}\cdot P_{\mathrm{neg}}(\mathrm{bin})
+ s_{\mathrm{res}}\cdot\bigl(\mathrm{SRMC} + \delta(\mathrm{bin})\bigr)
\]

| Bucket | Share | Price used |
|--------|-------|------------|
| Gas-setting | \(s_{\mathrm{gas}}\) | SRMC |
| Negative | \(s_{\mathrm{neg}}\) | empirical \(P_{\mathrm{neg}}(\mathrm{bin})\) |
| Residual | \(s_{\mathrm{res}}\) | SRMC + \(\delta(\mathrm{bin})\) |

Compare \(P_{\mathrm{model}}\) to `da_price_mean` on the same block for validation.

**Outputs:**

- `module3_vre_delta_block_reconstruction.csv`
- `module3_vre_delta_bin_reconstruction.csv`
- `delta_by_vre_bin_meta.json`

---

## 7. What this is / isn’t

**Is:** a defendable accounting identity over three regimes, driven by short-period renewable intensity and gas SRMC, with two empirically calibrated plugs.

**Isn’t:** a full merit-order stack (coal offers, interconnectors, must-run detail), and not a claim of euro-perfect auction replication.

---

## 8. Pipeline scripts (order)

1. `entsoe-pipeline/build_vre_block_panel.py` — hours → 4-block panel + VRE bins  
2. `entsoe-pipeline/calibrate_delta_by_vre_bin.py` — empirical \(P_{\mathrm{neg}}(\mathrm{bin})\), \(\delta(\mathrm{bin})\), reconstruction  
3. `entsoe-pipeline/backsolve_residual_price.py` — earlier annual constant-\(\delta\) prototype (superseded for block pricing by step 2)

Supporting upstream: `gas_price_setting_share.py` (SRMC + gas-setting definition), `pull_and_compute.py` (prices / generation).

---

## 9. Not built yet (next)

**Scenario engine:** change solar/wind shares and/or TTF → new VRE bins and SRMC → reuse bin plug tables (and bin-average or modelled shares) → new \(P_{\mathrm{model}}\). Individual technology shares are already on the panel for that purpose.
