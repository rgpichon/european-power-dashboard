/**
 * Plant Economics engine — line-for-line port of Excel_model/Gas_Plant_v17.xlsx
 *
 * Ass.!M4 scenario selector ("Base case"); Ass.!D11 construction flag
 * (0 = already operating, 1 = under construction). Const./Financ./Ops./
 * 3 Stats./Gear./Val. formulas matched to v17.
 */

import {
  computeAnnualStateAggregate,
  eegCapacityAt,
  emberCaps2025,
  loadDataFromUrls
} from "./im_engine/scenarioEngine.js?v=20260920v17";

var _dataPromise = null;

export function ensurePeData(baseUrl) {
  if (!_dataPromise) {
    _dataPromise = loadDataFromUrls(baseUrl || "./im_data/");
  }
  return _dataPromise;
}

export function buildImLinkedPricePath(data, imState, years) {
  imState = imState || {};
  var solarPct = Number.isFinite(imState.solarPct) ? imState.solarPct : 100;
  var windPct = Number.isFinite(imState.windPct) ? imState.windPct : 100;
  var stress = Number.isFinite(imState.ttfAdjustmentPct)
    ? imState.ttfAdjustmentPct
    : 0;
  var windYear = imState.windYear || "base";
  var demand = imState.demandScenario || "B";
  var caps2025 = emberCaps2025(data);
  var era =
    data.gasSrmc && data.gasSrmc.scenario_default_era
      ? data.gasSrmc.scenario_default_era
      : { efficiency: 0.58, eua_multiplier_t_per_mwh_e: 0.348207 };
  var eraEff = era.efficiency > 0 ? era.efficiency : 0.58;
  var eraEuaMult =
    era.eua_multiplier_t_per_mwh_e != null ? era.eua_multiplier_t_per_mwh_e : 0.35;
  var co2PerGasMwh = eraEuaMult * eraEff;

  var byYear = {};
  var lastFull = null;

  years.forEach(function (year) {
    var engineYear = Math.min(Math.max(year, 2025), 2045);
    if (!byYear[engineYear]) {
      var onTrack = eegCapacityAt(engineYear, caps2025);
      var agg = computeAnnualStateAggregate(data, {
        year: engineYear,
        solarCapacityGW: onTrack.solar * (solarPct / 100),
        windCapacityGW: onTrack.wind * (windPct / 100),
        windYearType: windYear,
        demandGrowthScenario: demand,
        ttfAdjustmentPct: stress
      });
      var c = agg.scenarioResult.commodities;
      byYear[engineYear] = {
        year: engineYear,
        electricityEurMwh: agg.avg_price_eur_mwh,
        ttfEurMwh: c.ttf_eur_mwh,
        euaEurPerT: c.eua_eur_per_t,
        srmcEurMwh: c.srmc_eur_mwh,
        S_gas: agg.S_gas,
        S_neg: agg.S_neg,
        S_res: agg.S_res,
        P_gas: agg.P_gas,
        P_neg: agg.P_neg,
        P_res: agg.P_res,
        co2PerGasMwh: co2PerGasMwh,
        eraEfficiency: eraEff,
        eraEuaMultiplier: eraEuaMult,
        extrapolatedPastImHorizon: false
      };
    }
    if (engineYear === 2045) lastFull = byYear[2045];
  });

  var bc = data.ttf && data.ttf.beyond_curve ? data.ttf.beyond_curve : {};
  var euaBc = data.eua && data.eua.beyond_curve ? data.eua.beyond_curve : {};
  var lastCurveYear = bc.last_curve_year != null ? bc.last_curve_year : 2030;
  var realAnchor =
    bc.real_ttf_eur_mwh != null
      ? bc.real_ttf_eur_mwh
      : lastFull
        ? lastFull.ttfEurMwh
        : 23;
  var inflation =
    bc.inflation_rate != null ? Number(bc.inflation_rate) : 0.02;
  var euaInflation =
    euaBc.inflation_rate != null ? Number(euaBc.inflation_rate) : inflation;
  Object.keys(byYear).forEach(function (k) {
    byYear[k].inflationRate = inflation;
  });

  return years.map(function (year) {
    if (year <= 2045) {
      return Object.assign({ calendarYear: year }, byYear[year] || byYear[2045]);
    }
    var ttf = realAnchor * Math.pow(1 + inflation, year - lastCurveYear);
    if (stress) ttf = ttf * (1 + stress / 100);
    var eua = lastFull
      ? Math.round(
          lastFull.euaEurPerT * Math.pow(1 + euaInflation, year - 2045) * 1e10
        ) / 1e10
      : 80;
    var pGas = ttf / eraEff + eua * eraEuaMult;
    var resPremium =
      lastFull && lastFull.P_gas != null && lastFull.P_res != null
        ? lastFull.P_res - lastFull.P_gas
        : 0;
    return {
      calendarYear: year,
      year: year,
      electricityEurMwh: lastFull ? lastFull.electricityEurMwh : 42.2,
      ttfEurMwh: ttf,
      euaEurPerT: eua,
      srmcEurMwh: pGas,
      S_gas: lastFull ? lastFull.S_gas : 0.3,
      S_neg: lastFull ? lastFull.S_neg : 0.2,
      S_res: lastFull ? lastFull.S_res : 0.5,
      P_gas: pGas,
      P_neg: lastFull && lastFull.P_neg != null ? lastFull.P_neg : 0,
      P_res: pGas + resPremium,
      co2PerGasMwh: co2PerGasMwh,
      eraEfficiency: eraEff,
      eraEuaMultiplier: eraEuaMult,
      inflationRate: inflation,
      extrapolatedPastImHorizon: true
    };
  });
}

/** Ops.!R21 — Excel dispatch hurdle (no VOM). */
export function plantSrmcEurMwh(ttfEurMwh, euaEurPerT, efficiency, co2PerGasMwh) {
  if (!(efficiency > 0)) return Infinity;
  return (1 / efficiency) * (ttfEurMwh + euaEurPerT * co2PerGasMwh);
}


var DEFAULTS = {
  capacityMw: 500,
  nameplateEfficiency: 0.65,
  availability: 0.6,
  /** Ass.!O9 / D8 Base case */
  degradationRate: 0.0025,
  capexPerMw: 1150000,
  gearing: 0.6,
  debtMargin: 0.02,
  dscrTarget: 1.2,
  icrTarget: 5.0,
  tenorYears: 30,
  euribor: 0.027,
  taxRate: 0.25,
  /** Ass.!O21 / D32 Base case €/MW-yr */
  fixedOmPerMw: 12000,
  /** Ass.!O22 / D33 Base case €/MWh */
  variableOmPerMwh: 1.5,
  overhaulCost: 6000000,
  overhaulIntervalYears: 6,
  usefulLifeYears: 30,
  costOfEquity: 0.06,
  /** Ass.!D41 */
  co2PerGasMwh: 0.20196,
  /** Ass.!D23 repayment start (also COD for geared case) */
  codYear: 2030,
  repaymentStartYear: 2030,
  modelStartYear: 2027,
  modelNYears: 34,
  /**
   * Ass.!D11 — Construction / Already operative.
   * Base case O10 = 0 (already operating).
   */
  construction: 0,
  constructionMonths: 30,
  constructionStart: "2027-06-30",
  phaseCostShares: [0.4, 0.3, 0.3],
  /** Ass.!M30–M33 IM toggles (applied in Excel IM Price Import; 0/0/0/0.45 base) */
  gasPriceAdjPct: 0,
  gasShareAdjPp: 0,
  co2PriceAdjPct: 0,
  passThroughBeta: 0.45
};

function mergeInputs(raw) {
  var o = Object.assign({}, DEFAULTS, raw || {});
  if (o.gearing > 1) o.gearing = o.gearing / 100;
  if (o.debtMargin > 0.5) o.debtMargin = o.debtMargin / 100;
  if (o.euribor > 0.5) o.euribor = o.euribor / 100;
  if (o.taxRate > 1) o.taxRate = o.taxRate / 100;
  if (o.availability > 1) o.availability = o.availability / 100;
  if (o.nameplateEfficiency > 1) o.nameplateEfficiency = o.nameplateEfficiency / 100;
  if (o.costOfEquity > 1) o.costOfEquity = o.costOfEquity / 100;
  if (o.degradationRate > 0.05) o.degradationRate = o.degradationRate / 100;
  o.construction = Number(o.construction) === 1 ? 1 : 0;
  if (raw == null || raw.repaymentStartYear == null) o.repaymentStartYear = o.codYear;
  // Ass.!D9 = YEAR(EOMONTH(D31,12)); D31 = IF(D11=1, EOMONTH(D13,D12), DATE(2027,1,1))
  if (raw == null || raw.degradationStartYear == null) {
    if (o.construction === 1) {
      var start = parseIsoDateUTC(o.constructionStart);
      var opsEnd = excelEomonth(start, o.constructionMonths || 30);
      o.degradationStartYear = excelEomonth(opsEnd, 12).getUTCFullYear();
    } else {
      o.degradationStartYear = 2028; // YEAR(EOMONTH(2027-01-01,12))
    }
  }
  delete o.ppaShare;
  delete o.ppaPrice;
  delete o.efficiencyFloorPct;
  return o;
}

/** Ass.!K43… euribor curve (v17). */
function buildEuriborCurve(nYears) {
  var e = [0.03, 0.029, 0.027, 0.0272];
  while (e.length < nYears) e.push(e[e.length - 1] + 0.0002);
  return e.slice(0, nYears);
}

function excelEomonth(date, months) {
  var y = date.getUTCFullYear();
  var m = date.getUTCMonth() + months;
  var yy = y + Math.floor(m / 12);
  var mm = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(yy, mm + 1, 0));
}

function parseIsoDateUTC(iso) {
  var parts = String(iso || "2027-06-30").split("-");
  return new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  );
}

function buildConstQuarterEnds(startYear, nQ) {
  var ends = [];
  for (var q = 0; q < nQ; q++) {
    var y = startYear + Math.floor(q / 4);
    var monthEnd = [3, 6, 9, 12][q % 4];
    ends.push(new Date(Date.UTC(y, monthEnd, 0)));
  }
  return ends;
}

function fillConstPhaseByDate(qEnds, startDate, duration) {
  var arr = new Array(qEnds.length).fill(0);
  var filled = 0;
  for (var q = 0; q < qEnds.length; q++) {
    if (qEnds[q] < startDate) {
      arr[q] = 0;
      continue;
    }
    var rem = duration - filled;
    if (rem <= 1e-15) {
      arr[q] = 0;
      continue;
    }
    var v = rem > 1 ? 1 : rem;
    arr[q] = v;
    filled += v;
  }
  return arr;
}

function aggregateCapIntAndPpe(p, years, euriborCurve, byYear) {
  var eop = 0;
  var ppeByYear = {};
  var capIntByYear = {};
  years.forEach(function (y, i) {
    if (y >= p.repaymentStartYear) {
      capIntByYear[y] = 0;
      ppeByYear[y] = byYear[y].cost;
      return;
    }
    var draw = byYear[y].debt;
    var eur = euriborCurve[i];
    var bop = i === 0 ? draw : eop;
    var capInt = bop * (eur + p.debtMargin);
    if (i === 0) eop = draw + capInt;
    else eop = bop + draw + capInt;
    capIntByYear[y] = capInt;
    ppeByYear[y] = byYear[y].cost + capInt;
  });
  var ppeTotal = 0;
  for (var i = 0; i < Math.min(5, years.length); i++) {
    ppeTotal += ppeByYear[years[i]] || 0;
  }
  return { eop: eop, ppeByYear: ppeByYear, capIntByYear: capIntByYear, ppeTotal: ppeTotal };
}

/**
 * Ass.!D11=0 — already operating: deliberate zero capital event.
 * Ass.!G12=0, G15=0, G16=0; Financ.!R25=0; PPE = capacity×€1m (Ass.!G13).
 * Ramp = 1 from model start (Const.!E10=0 → quarterly ramp 100%).
 */
function buildAlreadyOperatingSchedule(p, years) {
  var byYear = {};
  years.forEach(function (y) {
    byYear[y] = { cost: 0, debt: 0, equity: 0, ramp: 1 };
  });
  var ppeTotal = p.capacityMw * 1e6; // Ass.!G13 when D11=0
  var ppeByYear = {};
  var capIntByYear = {};
  years.forEach(function (y) {
    ppeByYear[y] = 0;
    capIntByYear[y] = 0;
  });
  return {
    totalCost: 0,
    ppeTotal: ppeTotal,
    byYear: byYear,
    ppeByYear: ppeByYear,
    capIntByYear: capIntByYear,
    debtAtCod: 0,
    mode: "already_operating"
  };
}

/**
 * Ass.!D11=1 — Const.! + Financ.! phased draws + IDC.
 * Debt/equity formulas only filled I–R in v17 (S+ blank) — replicate that.
 */
function buildUnderConstructionSchedule(p, years, euriborCurve) {
  var totalCost = p.capacityMw * p.capexPerMw; // Ass.!G12
  var shares = p.phaseCostShares || [0.4, 0.3, 0.3];
  var phaseDur = (p.constructionMonths || 30) / 9;
  var nQ = 20;
  var startYear = years[0];
  var qEnds = buildConstQuarterEnds(startYear, nQ);
  var start1 = parseIsoDateUTC(p.constructionStart || "2027-06-30");
  var start2 = excelEomonth(start1, 10);
  var start3 = excelEomonth(start2, 10);
  var phaseQ = [
    fillConstPhaseByDate(qEnds, start1, phaseDur),
    fillConstPhaseByDate(qEnds, start2, phaseDur),
    fillConstPhaseByDate(qEnds, start3, phaseDur)
  ];
  var qRamp = [];
  for (var q = 0; q < nQ; q++) {
    if (q < 10) qRamp.push(0);
    else if (q === 10) qRamp.push(0.05);
    else {
      var prevR = qRamp[q - 1];
      if (prevR >= 1) qRamp.push(1);
      else if (prevR + 0.15 > 1) qRamp.push(1);
      else qRamp.push(prevR + 0.15);
    }
  }
  var lastDebtEquityQ = 9; // Const.! columns I–R only
  var qCost = [];
  var qDebt = [];
  var qEquity = [];
  var qYear = [];
  for (var q = 0; q < nQ; q++) {
    var y = startYear + Math.floor(q / 4);
    qYear.push(y);
    var c =
      (phaseQ[0][q] / phaseDur) * shares[0] * totalCost +
      (phaseQ[1][q] / phaseDur) * shares[1] * totalCost +
      (phaseQ[2][q] / phaseDur) * shares[2] * totalCost;
    qCost.push(c);
    if (q <= lastDebtEquityQ) {
      qDebt.push(c * p.gearing);
      qEquity.push(c * (1 - p.gearing));
    } else {
      qDebt.push(0);
      qEquity.push(0);
    }
  }
  var byYear = {};
  years.forEach(function (y) {
    byYear[y] = { cost: 0, debt: 0, equity: 0, ramp: 0 };
  });
  for (var q = 0; q < nQ; q++) {
    var y = qYear[q];
    if (!byYear[y]) byYear[y] = { cost: 0, debt: 0, equity: 0, ramp: 0 };
    byYear[y].cost += qCost[q];
    byYear[y].debt += qDebt[q];
    byYear[y].equity += qEquity[q];
    byYear[y].ramp += qRamp[q];
  }
  years.forEach(function (y) {
    if (byYear[y].ramp > 1) byYear[y].ramp = 1;
  });
  years.forEach(function (y) {
    if (y >= p.repaymentStartYear) byYear[y].ramp = 1;
  });
  var agg = aggregateCapIntAndPpe(p, years, euriborCurve, byYear);
  return {
    totalCost: totalCost,
    ppeTotal: agg.ppeTotal,
    byYear: byYear,
    ppeByYear: agg.ppeByYear,
    capIntByYear: agg.capIntByYear,
    debtAtCod: agg.eop,
    mode: "under_construction"
  };
}

function buildConstructionSchedule(p, years, euriborCurve) {
  if (Number(p.construction) === 1) {
    return buildUnderConstructionSchedule(p, years, euriborCurve);
  }
  return buildAlreadyOperatingSchedule(p, years);
}

function npvAt(rate, cashflows) {
  var s = 0;
  for (var i = 0; i < cashflows.length; i++) s += cashflows[i] / Math.pow(1 + rate, i);
  return s;
}

function irrNewton(cashflows) {
  var hasPos = false,
    hasNeg = false;
  for (var i = 0; i < cashflows.length; i++) {
    if (cashflows[i] > 0) hasPos = true;
    if (cashflows[i] < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  function npv(rate) {
    var s = 0;
    for (var i = 0; i < cashflows.length; i++) {
      s += cashflows[i] / Math.pow(1 + rate, i);
    }
    return s;
  }

  // Bracket a sign change of NPV on (-0.99, 5], then bisect (Excel IRR-style).
  var lo = -0.99;
  var hi = 5;
  var fLo = npv(lo);
  var fHi = npv(hi);
  var bracketed = false;
  var grid = [-0.5, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.5, 1, 2];
  var prevR = lo;
  var prevF = fLo;
  for (var g = 0; g < grid.length; g++) {
    var r = grid[g];
    var f = npv(r);
    if (prevF === 0) return prevR;
    if (f === 0) return r;
    if (prevF * f < 0) {
      lo = prevR;
      hi = r;
      fLo = prevF;
      fHi = f;
      bracketed = true;
      break;
    }
    prevR = r;
    prevF = f;
  }
  if (!bracketed && fLo * fHi < 0) {
    bracketed = true;
  }
  if (!bracketed) return null;
  for (var k = 0; k < 80; k++) {
    var mid = (lo + hi) / 2;
    var fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Scen. & Sensi. primary metric: cumulative net equity CF through the
 * last year with positive annual net equity CF (base case → 2049).
 * If the series never turns positive (typical under construction), sum
 * through the base-case window end (2049) so the metric stays comparable.
 */
function cumulativeEquityCfThroughCrossover(years, equityNetCfs) {
  var lastPosYear = null;
  for (var i = 0; i < years.length; i++) {
    if (equityNetCfs[i] != null && equityNetCfs[i] > 0) lastPosYear = years[i];
  }
  var windowEnd = lastPosYear != null ? lastPosYear : 2049;
  var cum = 0;
  for (var i = 0; i < years.length; i++) {
    if (years[i] <= windowEnd) cum += equityNetCfs[i] || 0;
  }
  return {
    crossoverYear: lastPosYear,
    cumulativeEquityCf: cum,
    cumWindowEnd: windowEnd
  };
}

/**
 * @param {object} rawInputs
 * @param {Array} pricePath
 */
export function runPlantEconomics(rawInputs, pricePath) {
  var p = mergeInputs(rawInputs);
  if (!pricePath || !pricePath.length) {
    throw new Error("pricePath is required");
  }

  var co2 = p.co2PerGasMwh;
  if (co2 == null || !Number.isFinite(co2)) co2 = 0.20196;
  p.co2PerGasMwh = co2;

  var years = pricePath.map(function (row) {
    return row.calendarYear != null ? row.calendarYear : row.year;
  });
  var n = years.length;
  var euriborCurve =
    p.euriborCurve && p.euriborCurve.length === n
      ? p.euriborCurve
      : buildEuriborCurve(n);

  var constr = buildConstructionSchedule(p, years, euriborCurve);
  var ppeTotal = constr.ppeTotal; // Ass.!G13
  var daAnnual = ppeTotal / p.usefulLifeYears; // 3 Stats!R20
  var balloonYear = p.repaymentStartYear + p.tenorYears - 1;

  var equityWeight = Number(p.construction) === 1 ? 1 - p.gearing : 1;
  var debtWeight = Number(p.construction) === 1 ? p.gearing : 0;
  var avgEur =
    euriborCurve.reduce(function (a, b) {
      return a + b;
    }, 0) / euriborCurve.length;
  // Val.!D20 WACC
  var wacc =
    p.costOfEquity * equityWeight +
    (avgEur + p.debtMargin) * debtWeight * (1 - p.taxRate);

  var efficiency = p.nameplateEfficiency;
  var bopDebt = 0;
  var nolBf = 0;
  var reserveBal = 0;
  var series = [];
  var equityNetCfs = [];
  var unleveredFcfs = [];
  var assetsNetPpe = 0;
  var cumDa = 0;
  var underConstruction = Number(p.construction) === 1;

  for (var i = 0; i < n; i++) {
    var year = years[i];
    var px = pricePath[i];
    var cy = constr.byYear[year] || { cost: 0, debt: 0, equity: 0, ramp: 0 };
    var ramp = cy.ramp;
    var constrFlag = underConstruction && year < p.repaymentStartYear ? 1 : 0;
    var eur = euriborCurve[i];
    var ttf = px.ttfEurMwh;
    var eua = px.euaEurPerT;
    var P_gas = px.P_gas;
    var P_res = px.P_res;
    var S_gas = px.S_gas != null ? px.S_gas : 0;
    var S_res = px.S_res != null ? px.S_res : 0;

    // Ops.!R11: IF(year<=Ass.!D9,0,D8)
    var degRate = year <= p.degradationStartYear ? 0 : p.degradationRate;
    if (i === 0) efficiency = p.nameplateEfficiency * (1 - degRate);
    else efficiency = efficiency * (1 - degRate);

    var srmc = plantSrmcEurMwh(ttf, eua, efficiency, co2);
    var sparkGas = P_gas - srmc;
    var sparkRes = P_res - srmc;
    var hrsGas = sparkGas > 0 ? ramp * 8760 * S_gas : 0;
    var hrsRes = sparkRes > 0 ? ramp * 8760 * S_res : 0;
    var hrsTot = hrsGas + hrsRes;

    // Ops.!R28/R29 = capacity × hours; R33 = sum; revenue = gen × price
    var mwhGas = p.capacityMw * hrsGas;
    var mwhRes = p.capacityMw * hrsRes;
    var mwh = mwhGas + mwhRes;
    var gasNeed = efficiency > 0 ? mwh / efficiency : 0;
    var co2t = gasNeed * co2;
    var revenue = mwhGas * P_gas + mwhRes * P_res;
    var fixedOm = ramp * p.capacityMw * p.fixedOmPerMw;
    var variableOm = mwh * p.variableOmPerMwh;
    var fuelCost = gasNeed * ttf;
    var carbonCost = co2t * eua;
    var opex = fixedOm + variableOm;
    var ebitda = revenue - opex - fuelCost - carbonCost;
    var da = daAnnual; // from year 1 (3 Stats!R20)

    var overhaulFlag = 0;
    var accrual = 0;
    if (year >= p.repaymentStartYear && p.overhaulIntervalYears > 0) {
      var opIndex = year - p.repaymentStartYear + 1;
      overhaulFlag = opIndex % p.overhaulIntervalYears === 0 ? 1 : 0;
      accrual = p.overhaulCost / p.overhaulIntervalYears;
    }
    reserveBal = reserveBal + accrual - overhaulFlag * p.overhaulCost;

    var draw = cy.debt;
    var eqInj = cy.equity;
    var capexOut = cy.cost;

    if (i === 0) bopDebt = draw;

    var interest = constrFlag === 1 ? 0 : bopDebt * (eur + p.debtMargin);
    var ebit = ebitda - da;
    var ebt = ebitda - da - interest;

    var taxable = Math.max(0, ebt - nolBf);
    var nolUsed = Math.min(nolBf, Math.max(ebt, 0));
    var nolCf = nolBf - nolUsed + Math.max(0, -ebt);
    var tax = taxable * p.taxRate;
    nolBf = nolCf;

    var cfads = ebitda - tax - accrual;

    var isBalloon = year === balloonYear;
    var principal = 0;
    if (underConstruction) {
      if (constrFlag === 1) {
        principal = 0;
      } else if (isBalloon) {
        principal = bopDebt;
      } else {
        principal = Math.min(
          bopDebt,
          Math.max(0, cfads / p.dscrTarget - interest)
        );
      }
    }

    var eopDebt = 0;
    if (underConstruction) {
      if (constrFlag === 1) {
        if (i === 0) eopDebt = draw + bopDebt * (eur + p.debtMargin) - principal;
        else
          eopDebt =
            bopDebt + draw + bopDebt * (eur + p.debtMargin) - principal;
      } else {
        eopDebt = Math.max(0, bopDebt - principal);
      }
    }

    var debtService = interest + principal;
    var dscr =
      constrFlag === 1 || debtService < 1 ? null : cfads / debtService;
    var icr = interest < 1 ? null : ebit / interest;

    var cashFlow =
      revenue +
      draw +
      eqInj -
      (capexOut + opex + fuelCost + carbonCost + interest + principal + tax);
    var equityCashFlow = -eqInj + cashFlow;
    equityNetCfs.push(equityCashFlow);

    var ufcf = (ebitda - da) * (1 - p.taxRate) + da - capexOut;
    unleveredFcfs.push(ufcf);

    cumDa += da;
    assetsNetPpe = Math.max(0, ppeTotal - cumDa);

    series.push({
      year: year,
      ramp: ramp,
      constrFlag: constrFlag,
      efficiency: efficiency,
      plantSrmc: srmc,
      sparkGas: sparkGas,
      sparkRes: sparkRes,
      srmcGapEurMwh: Math.max(sparkGas, sparkRes),
      sparkSpreadEurMwh:
        mwh > 0
          ? (revenue - fuelCost - carbonCost - variableOm) / mwh
          : 0,
      hrsGas: hrsGas,
      hrsRes: hrsRes,
      mwhGeneration: mwh,
      mwhGas: mwhGas,
      mwhRes: mwhRes,
      merchantMwh: mwh,
      gasNeed: gasNeed,
      co2: co2t,
      revenue: revenue,
      fixedOm: fixedOm,
      variableOm: variableOm,
      opex: opex,
      fuelCost: fuelCost,
      carbonCost: carbonCost,
      fuelGas: fuelCost,
      fuelCarbon: carbonCost,
      ebitda: ebitda,
      da: da,
      ebit: ebit,
      interest: interest,
      ebt: ebt,
      tax: tax,
      taxable: taxable,
      nolBf: nolBf,
      cfads: cfads,
      principal: principal,
      scheduledPrincipal: constrFlag || !underConstruction ? 0 : isBalloon ? 0 : principal,
      debtService: debtService,
      dscr: dscr,
      icr: icr,
      bopDebt: bopDebt,
      eopDebt: eopDebt,
      debtBalance: eopDebt,
      draw: draw,
      equityInjection: eqInj,
      capex: capexOut,
      cashFlow: cashFlow,
      equityCashFlow: equityCashFlow,
      accrual: accrual,
      overhaulFlag: overhaulFlag,
      isBalloon: isBalloon,
      P_gas: P_gas,
      P_res: P_res,
      S_gas: S_gas,
      S_res: S_res,
      ttf: ttf,
      eua: eua,
      electricityPrice: px.electricityEurMwh,
      assetsNetPpe: assetsNetPpe
    });
    bopDebt = eopDebt;
  }

  var y0 = years[0];
  var equityNpv = 0;
  for (var i = 0; i < n; i++) {
    equityNpv +=
      equityNetCfs[i] / Math.pow(1 + p.costOfEquity, years[i] - y0);
  }
  var enterpriseNpv = 0;
  for (var i = 0; i < n; i++) {
    enterpriseNpv += unleveredFcfs[i] / Math.pow(1 + wacc, years[i] - y0);
  }
  var equityIrr = irrNewton(equityNetCfs);
  var cumMetric = cumulativeEquityCfThroughCrossover(years, equityNetCfs);

  var dscrs = series
    .map(function (r) {
      return r.dscr;
    })
    .filter(function (d) {
      return d != null && Number.isFinite(d);
    });
  var minDscr = dscrs.length ? Math.min.apply(null, dscrs) : null;

  var nonBalloon = series.filter(function (r) {
    return !r.isBalloon && r.constrFlag !== 1;
  });
  var posSched = nonBalloon.filter(function (r) {
    return r.principal > 1;
  });
  var balloonRow = series.find(function (r) {
    return r.isBalloon;
  });

  var charts = {
    years: years.slice(),
    revenue: series.map(function (r) {
      return r.revenue;
    }),
    ebitda: series.map(function (r) {
      return r.ebitda;
    }),
    cfads: series.map(function (r) {
      return r.cfads;
    }),
    dscr: series.map(function (r) {
      return r.dscr;
    }),
    icr: series.map(function (r) {
      return r.icr;
    }),
    debtBalance: series.map(function (r) {
      return r.debtBalance;
    }),
    assetsNetPpe: series.map(function (r) {
      return r.assetsNetPpe;
    }),
    equityCashFlow: series.map(function (r) {
      return r.equityCashFlow;
    }),
    srmcGapEurMwh: series.map(function (r) {
      return r.srmcGapEurMwh;
    }),
    sparkSpreadEurMwh: series.map(function (r) {
      return r.sparkSpreadEurMwh;
    }),
    plantSrmc: series.map(function (r) {
      return r.plantSrmc;
    }),
    fixedOm: series.map(function (r) {
      return r.fixedOm;
    }),
    variableOm: series.map(function (r) {
      return r.variableOm;
    }),
    fuelCost: series.map(function (r) {
      return r.fuelCost;
    }),
    carbonCost: series.map(function (r) {
      return r.carbonCost;
    }),
    mwhGeneration: series.map(function (r) {
      return r.mwhGeneration;
    })
  };

  return {
    inputs: Object.assign({}, p, {
      ppeTotal: ppeTotal,
      totalConstCost: constr.totalCost,
      wacc: wacc,
      plantSrmcAtCod: series.find(function (r) {
        return r.year === p.codYear;
      })
        ? series.find(function (r) {
            return r.year === p.codYear;
          }).plantSrmc
        : null
    }),
    series: series,
    charts: charts,
    minDscr: minDscr,
    equityNpv: equityNpv,
    enterpriseNpv: enterpriseNpv,
    equityIrr: equityIrr,
    crossoverYear: cumMetric.crossoverYear,
    cumulativeEquityCf: cumMetric.cumulativeEquityCf,
    cumWindowEnd: cumMetric.cumWindowEnd,
    wacc: wacc,
    balloonYear: balloonYear,
    amortization: {
      effectivelyBullet: posSched.length === 0,
      positiveScheduledYears: posSched.length,
      nonBalloonYears: nonBalloon.length,
      balloonPrincipal: balloonRow ? balloonRow.principal : 0
    },
    construction: constr
  };
}


export function computeEquitySensitivity(baseInputs, pricePath, shockPct) {
  shockPct = shockPct != null ? shockPct : 0.2;
  var base = runPlantEconomics(baseInputs, pricePath);
  var useIrr = base.equityIrr != null && Number.isFinite(base.equityIrr);
  var baseValue = useIrr ? base.equityIrr : base.equityNpv;
  var levers = [
    { key: "capexPerMw", label: "Capex / MW" },
    { key: "gearing", label: "Gearing" },
    { key: "debtMargin", label: "Debt margin" },
    { key: "fixedOmPerMw", label: "Fixed O&M" },
    { key: "nameplateEfficiency", label: "Efficiency" }
  ];
  function scalePath(path, factor) {
    return path.map(function (row) {
      return Object.assign({}, row, {
        P_gas: row.P_gas != null ? row.P_gas * factor : row.P_gas,
        P_res: row.P_res != null ? row.P_res * factor : row.P_res,
        electricityEurMwh: row.electricityEurMwh * factor
      });
    });
  }
  var rows = levers.map(function (lev) {
    var lowIn = Object.assign({}, base.inputs);
    var highIn = Object.assign({}, base.inputs);
    lowIn[lev.key] = base.inputs[lev.key] * (1 - shockPct);
    highIn[lev.key] = base.inputs[lev.key] * (1 + shockPct);
    var low = runPlantEconomics(lowIn, pricePath);
    var high = runPlantEconomics(highIn, pricePath);
    var lowV = useIrr ? low.equityIrr : low.equityNpv;
    var highV = useIrr ? high.equityIrr : high.equityNpv;
    return {
      label: lev.label,
      low: lowV,
      high: highV,
      deltaLow: lowV != null && baseValue != null ? lowV - baseValue : null,
      deltaHigh: highV != null && baseValue != null ? highV - baseValue : null
    };
  });
  // Electricity price lever via path
  var lowP = runPlantEconomics(base.inputs, scalePath(pricePath, 1 - shockPct));
  var highP = runPlantEconomics(base.inputs, scalePath(pricePath, 1 + shockPct));
  var lowPv = useIrr ? lowP.equityIrr : lowP.equityNpv;
  var highPv = useIrr ? highP.equityIrr : highP.equityNpv;
  rows.push({
    label: "Electricity / state prices",
    low: lowPv,
    high: highPv,
    deltaLow: lowPv != null && baseValue != null ? lowPv - baseValue : null,
    deltaHigh: highPv != null && baseValue != null ? highPv - baseValue : null
  });
  rows.sort(function (a, b) {
    var ma = Math.max(Math.abs(a.deltaLow || 0), Math.abs(a.deltaHigh || 0));
    var mb = Math.max(Math.abs(b.deltaLow || 0), Math.abs(b.deltaHigh || 0));
    return mb - ma;
  });
  return { metric: useIrr ? "irr" : "npv", shockPct: shockPct, baseValue: baseValue, rows: rows };
}

export function computeEquityNpvGrid(baseInputs, pricePath, opts) {
  opts = opts || {};
  var elecShocks = opts.elecShocks || [-0.2, -0.1, 0, 0.1, 0.2];
  var capexShocks = opts.capexShocks || [-0.2, -0.1, 0, 0.1, 0.2];
  var base = runPlantEconomics(baseInputs, pricePath);
  function scalePathPrices(path, factor) {
    return path.map(function (row) {
      return Object.assign({}, row, {
        electricityEurMwh: row.electricityEurMwh * factor,
        P_gas: row.P_gas != null ? row.P_gas * factor : row.P_gas,
        P_res: row.P_res != null ? row.P_res * factor : row.P_res,
        P_neg: row.P_neg != null ? row.P_neg * factor : row.P_neg
      });
    });
  }
  var matrix = elecShocks.map(function (eShock) {
    var path = scalePathPrices(pricePath, 1 + eShock);
    return capexShocks.map(function (cShock) {
      return runPlantEconomics(
        Object.assign({}, base.inputs, {
          capexPerMw: base.inputs.capexPerMw * (1 + cShock)
        }),
        path
      ).equityNpv;
    });
  });
  return {
    baseNpv: base.equityNpv,
    elecShocks: elecShocks,
    capexShocks: capexShocks,
    rowLabels: elecShocks.map(function (s) {
      return s === 0 ? "Base" : (s > 0 ? "+" : "") + Math.round(s * 100) + "% elec";
    }),
    colLabels: capexShocks.map(function (s) {
      return s === 0 ? "Base" : (s > 0 ? "+" : "") + Math.round(s * 100) + "% capex";
    }),
    matrix: matrix
  };
}

export function excelModelYears(inputs) {
  var p = mergeInputs(inputs);
  var years = [];
  for (var i = 0; i < p.modelNYears; i++) years.push(p.modelStartYear + i);
  return years;
}

/**
 * Apply Ass.!M30–M33 style IM toggles onto an already-built price path
 * (gas price %, gas share pp, β pass-through into P_res).
 */
export function applyImPathToggles(pricePath, toggles) {
  toggles = toggles || {};
  var gasPriceAdj =
    toggles.gasPriceAdjPct != null ? Number(toggles.gasPriceAdjPct) : 0;
  var gasSharePp =
    toggles.gasShareAdjPp != null ? Number(toggles.gasShareAdjPp) : 0;
  var beta =
    toggles.passThroughBeta != null ? Number(toggles.passThroughBeta) : 0.45;
  return pricePath.map(function (row) {
    var ttf0 = row.ttfEurMwh;
    var eua = row.euaEurPerT;
    var eff = row.eraEfficiency != null ? row.eraEfficiency : 0.58;
    var co2 =
      row.co2PerGasMwh != null
        ? row.co2PerGasMwh
        : (row.eraEuaMultiplier != null ? row.eraEuaMultiplier : 0.348207) * eff;
    var srmc0 = plantSrmcEurMwh(ttf0, eua, eff, co2);
    var ttf1 = ttf0 * (1 + gasPriceAdj);
    var srmc1 = plantSrmcEurMwh(ttf1, eua, eff, co2);
    var S_gas0 = row.S_gas != null ? row.S_gas : 0;
    var S_neg0 = row.S_neg != null ? row.S_neg : 0;
    var S_res0 = row.S_res != null ? row.S_res : Math.max(0, 1 - S_gas0 - S_neg0);
    var S_gas1 = Math.max(0, Math.min(1, S_gas0 + gasSharePp));
    var remain = Math.max(0, 1 - S_gas1);
    var negRes = S_neg0 + S_res0;
    var S_neg1 = negRes > 0 ? remain * (S_neg0 / negRes) : 0;
    var S_res1 = remain - S_neg1;
    var P_gas1 = row.P_gas != null ? row.P_gas + (srmc1 - srmc0) : srmc1;
    var P_res1 =
      row.P_res != null ? row.P_res + beta * (srmc1 - srmc0) : row.P_res;
    return Object.assign({}, row, {
      ttfEurMwh: ttf1,
      srmcEurMwh: srmc1,
      S_gas: S_gas1,
      S_neg: S_neg1,
      S_res: S_res1,
      P_gas: P_gas1,
      P_res: P_res1,
      electricityEurMwh:
        S_gas1 * P_gas1 +
        S_neg1 * (row.P_neg || 0) +
        S_res1 * (P_res1 || 0)
    });
  });
}

/**
 * Scen. & Sensi. six-lever grid — same shock points as Gas_Plant_v17
 * "Scen. & Sensi." sheet. Metric = cumulative net equity CF through 2049
 * (base-case last positive year). Live engine values (not Excel Data Table cache).
 */
export function computeScenSensiGrid(baseInputs, basePricePath) {
  var base = Object.assign({}, DEFAULTS, baseInputs || {}, { construction: 0 });
  var path0 = basePricePath;
  var beta = base.passThroughBeta != null ? base.passThroughBeta : 0.45;

  function cum(inputs, path) {
    return runPlantEconomics(inputs, path || path0).cumulativeEquityCf;
  }

  var omLevels = [10000, 11000, 12000, 13500, 15000];
  var omLabels = ["€10,000", "€11,000", "€12,000 (base)", "€13,500", "€15,000"];
  var effLevels = [0.61, 0.63, 0.65, 0.66, 0.67];
  var effLabels = ["61%", "63%", "65% (base)", "66%", "67%"];
  var degLevels = [0.0015, 0.002, 0.0025, 0.0035, 0.005];
  var degLabels = ["0.15%", "0.20%", "0.25% (base)", "0.35%", "0.50%"];
  var gasPct = [-0.2, -0.1, 0, 0.1, 0.2];
  var gasPctLabels = ["−20%", "−10%", "+0% (base)", "+10%", "+20%"];
  var gasShare = [-0.1, -0.05, 0, 0.05, 0.1];
  var gasShareLabels = ["−10pp", "−5pp", "+0pp (base)", "+5pp", "+10pp"];
  var levLevels = [0.4, 0.5, 0.6, 0.7, 0.8];
  var levLabels = ["40%", "50%", "60% (base)", "70%", "80%"];

  return {
    metric: "cumulativeEquityCf",
    windowNote:
      "Cum. net equity CF 2027–2049 (base-case last positive year). Live engine.",
    levers: [
      {
        id: "om",
        label: "Fixed O&M",
        unit: "€/MW-yr",
        labels: omLabels,
        values: omLevels.map(function (v) {
          return cum(Object.assign({}, base, { fixedOmPerMw: v }));
        }),
        baseIndex: 2
      },
      {
        id: "efficiency",
        label: "Efficiency",
        unit: "nameplate",
        labels: effLabels,
        values: effLevels.map(function (v) {
          return cum(Object.assign({}, base, { nameplateEfficiency: v }));
        }),
        baseIndex: 2
      },
      {
        id: "degradation",
        label: "Degradation",
        unit: "%/yr",
        labels: degLabels,
        values: degLevels.map(function (v) {
          return cum(Object.assign({}, base, { degradationRate: v }));
        }),
        baseIndex: 2
      },
      {
        id: "gasPrice",
        label: "Gas price",
        unit: "shock",
        labels: gasPctLabels,
        values: gasPct.map(function (g) {
          return cum(
            base,
            applyImPathToggles(path0, {
              gasPriceAdjPct: g,
              passThroughBeta: beta
            })
          );
        }),
        baseIndex: 2
      },
      {
        id: "gasShare",
        label: "Gas share",
        unit: "pp",
        labels: gasShareLabels,
        values: gasShare.map(function (g) {
          return cum(
            base,
            applyImPathToggles(path0, {
              gasShareAdjPp: g,
              passThroughBeta: beta
            })
          );
        }),
        baseIndex: 2
      },
      {
        id: "leverage",
        label: "Leverage",
        unit: "gearing · D11=1",
        labels: levLabels,
        values: levLevels.map(function (v) {
          return cum(
            Object.assign({}, base, { construction: 1, gearing: v })
          );
        }),
        baseIndex: 2,
        forcedConstruction: true
      }
    ]
  };
}

export { DEFAULTS as PE_DEFAULTS };
