/**
 * Pre-revenue / early-stage valuation lens.
 *
 * Traditional DCF pretends precision that does not exist for companies
 * without stable revenue or free cash flow. This module gives an explicit,
 * honest methodology instead:
 *
 *  - probability-weighted scenarios (failure / base / bull)
 *  - runway and cash burn when the data exists
 *  - TAM/SAM/SOM anchoring when the user supplies it
 *  - milestone risk and dilution risk applied explicitly
 *  - reverse-expectations framing when only the market price is known
 *  - abstention with a concrete list of missing inputs when there is not
 *    enough data to say anything defensible
 *
 * Fully deterministic: no LLM or network calls.
 */

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function fmtPct(value, digits = 0) {
  return isFiniteNumber(value) ? `${(value * 100).toFixed(digits)}%` : "N/D";
}

function fmtMoney(value) {
  if (!isFiniteNumber(value)) return "N/D";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  return `$${value.toFixed(2)}`;
}

/**
 * Decide whether the pre-revenue lens applies. A mature company with real
 * revenue, FCF and ROIC should use the standard DCF/ROIC stack instead.
 */
export function isPreRevenueCandidate({ drivers = {}, snapshot = {} } = {}) {
  const revenue = num(snapshot?.facts?.revenue?.value);
  const fcf = num(snapshot?.facts?.fcf);
  const baseFcf = num(drivers?.baseFcf);
  const noRevenue = revenue === null || revenue <= 0;
  const tinyRevenue = revenue !== null && revenue > 0 && revenue < 150_000_000;
  const noCash = (baseFcf === null || baseFcf <= 0) && (fcf === null || fcf <= 0);
  return noRevenue || (tinyRevenue && noCash);
}

/**
 * Build the pre-revenue assessment.
 *
 * extras (all optional, user-supplied):
 *   cashUsd            liquid cash on the balance sheet
 *   tamUsd/samUsd/somUsd   addressable market sizing
 *   targetMargin       steady-state operating margin if the thesis works
 *   yearsToScale       years until SOM revenue is reached
 *   expectedDilution   cumulative dilution over the horizon (e.g. 0.35)
 *   failureProbability explicit prior for total loss
 *   milestones         [{ label, probability }] — sequential de-risking gates
 */
export function buildPreRevenueValuation({ drivers = {}, snapshot = {}, extras = {} } = {}) {
  const applicable = isPreRevenueCandidate({ drivers, snapshot });
  if (!applicable) {
    return {
      version: "pre_revenue_lens_v1",
      applicable: false,
      status: "not_applicable",
      summary: "La empresa tiene revenue/FCF suficientes: usa el stack DCF/ROIC/reverse-DCF con supuestos visibles.",
    };
  }

  const facts = snapshot?.facts || {};
  const revenue = num(facts?.revenue?.value);
  const fcf = num(facts?.fcf);
  const cfo = num(facts?.cfo?.value);
  const shares = num(facts?.shares?.value);
  const price = num(drivers?.price);
  const wacc = num(drivers?.wacc) ?? 0.1;
  const marketCap = shares !== null && shares > 0 && price !== null ? shares * price : null;

  // --- Runway / burn (only when the data exists) ---
  const cashUsd = num(extras.cashUsd) ?? num(facts?.cash?.value);
  const annualBurn = (() => {
    const burnSource = fcf !== null && fcf < 0 ? fcf : cfo !== null && cfo < 0 ? cfo : null;
    return burnSource !== null ? Math.abs(burnSource) : null;
  })();
  const runwayYears = cashUsd !== null && cashUsd > 0 && annualBurn !== null && annualBurn > 0
    ? cashUsd / annualBurn
    : null;

  // --- Milestone risk ---
  const milestones = (Array.isArray(extras.milestones) ? extras.milestones : [])
    .map((item) => ({ label: String(item?.label || "").trim() || "Hito", probability: clamp(num(item?.probability) ?? 0.5, 0.01, 0.99) }))
    .slice(0, 8);
  const milestoneSurvival = milestones.length
    ? milestones.reduce((product, item) => product * item.probability, 1)
    : null;

  // --- Failure probability prior ---
  let failureProbability = num(extras.failureProbability);
  if (failureProbability === null) {
    failureProbability = revenue === null || revenue <= 0 ? 0.55 : 0.35;
    if (runwayYears !== null && runwayYears < 1) failureProbability = clamp(failureProbability + 0.15, 0, 0.92);
    if (runwayYears !== null && runwayYears > 2.5) failureProbability = clamp(failureProbability - 0.07, 0.05, 0.92);
    if (milestoneSurvival !== null) failureProbability = clamp(1 - (1 - failureProbability) * (0.5 + 0.5 * milestoneSurvival), 0.05, 0.95);
  } else {
    failureProbability = clamp(failureProbability, 0, 0.98);
  }

  // --- Dilution risk ---
  const expectedDilution = clamp(num(extras.expectedDilution) ?? (runwayYears !== null && runwayYears < 1.5 ? 0.35 : 0.25), 0, 0.9);

  // --- Value anchor: TAM/SAM/SOM if supplied, otherwise reverse expectations ---
  const somUsd = num(extras.somUsd);
  const samUsd = num(extras.samUsd);
  const tamUsd = num(extras.tamUsd);
  const targetMargin = clamp(num(extras.targetMargin) ?? 0.18, 0.02, 0.5);
  const yearsToScale = clamp(num(extras.yearsToScale) ?? 7, 2, 15);
  const discountRate = clamp(wacc + 0.06, 0.1, 0.3); // early-stage premium over WACC
  const evToEbit = 12; // conservative steady-state multiple, visible assumption

  let scenarios = null;
  let probabilityWeightedValuePerShare = null;
  let status = "abstain";
  const missingInputs = [];
  const assumptions = [];

  if (somUsd !== null && somUsd > 0 && shares !== null && shares > 0) {
    const steadyEbit = somUsd * targetMargin;
    const terminalEv = steadyEbit * evToEbit;
    const discounted = terminalEv / ((1 + discountRate) ** yearsToScale);
    const baseValuePerShare = (discounted / shares) / (1 + expectedDilution);
    const bullValuePerShare = baseValuePerShare * 2.2; // captures SAM upside; visible, falsifiable
    const failValuePerShare = 0;
    const pFail = failureProbability;
    const pBull = clamp((1 - pFail) * 0.25, 0.01, 0.35);
    const pBase = clamp(1 - pFail - pBull, 0.01, 0.95);
    probabilityWeightedValuePerShare = pFail * failValuePerShare + pBase * baseValuePerShare + pBull * bullValuePerShare;
    scenarios = [
      { id: "fail", label: "Fracaso / dilución terminal", probability: pFail, valuePerShare: failValuePerShare },
      { id: "base", label: "Ejecuta y captura el SOM", probability: pBase, valuePerShare: baseValuePerShare },
      { id: "bull", label: "Escala hacia el SAM", probability: pBull, valuePerShare: bullValuePerShare },
    ];
    status = "ok";
    assumptions.push(
      `SOM ${fmtMoney(somUsd)} con margen operativo objetivo ${fmtPct(targetMargin)} en ${yearsToScale} años.`,
      `Múltiplo EV/EBIT terminal ${evToEbit}x, descuento ${fmtPct(discountRate)} (WACC + premio early-stage).`,
      `Dilución esperada ${fmtPct(expectedDilution)} aplicada al valor por acción.`,
      `Probabilidad de fracaso ${fmtPct(failureProbability)}${milestones.length ? ` (ajustada por ${milestones.length} hito${milestones.length === 1 ? "" : "s"})` : ""}.`,
    );
    if (samUsd !== null) assumptions.push(`SAM declarado: ${fmtMoney(samUsd)}; TAM: ${fmtMoney(tamUsd)}.`);
  } else if (marketCap !== null && marketCap > 0) {
    status = "expectations_only";
    if (somUsd === null) missingInputs.push("SOM (mercado alcanzable en USD)");
    if (shares === null) missingInputs.push("acciones en circulación");
  } else {
    status = "abstain";
    if (shares === null) missingInputs.push("acciones en circulación");
    if (price === null) missingInputs.push("precio de mercado");
    if (somUsd === null) missingInputs.push("TAM/SAM/SOM");
  }
  if (cashUsd === null) missingInputs.push("caja líquida (para runway)");
  if (annualBurn === null) missingInputs.push("burn anual (CFO/FCF negativo)");

  // Reverse-expectations framing: what the current price already demands.
  let impliedExpectations = null;
  if (marketCap !== null && marketCap > 0) {
    const impliedSteadyEbit = (marketCap * (1 + expectedDilution) * ((1 + discountRate) ** yearsToScale)) / evToEbit;
    const impliedRevenue = impliedSteadyEbit / targetMargin;
    impliedExpectations = {
      marketCap,
      impliedSteadyEbit,
      impliedRevenue,
      note: `Para justificar el precio actual (${fmtMoney(marketCap)} de capitalización), la empresa necesitaría ~${fmtMoney(impliedRevenue)} de revenue estable con margen ${fmtPct(targetMargin)} en ${yearsToScale} años, sobreviviendo a dilución de ${fmtPct(expectedDilution)}.`,
    };
  }

  const upside = probabilityWeightedValuePerShare !== null && price !== null && price > 0
    ? probabilityWeightedValuePerShare / price - 1
    : null;

  const summary = status === "ok"
    ? `Valor ponderado por probabilidad: ${fmtMoney(probabilityWeightedValuePerShare)} por acción (${fmtPct(upside, 1)} vs precio). Esto es un rango de escenarios, no un fair value puntual.`
    : status === "expectations_only"
      ? "Sin TAM/SAM/SOM no publicamos fair value. Mostramos qué expectativas ya están implícitas en el precio actual para que decidas si son creíbles."
      : "Datos insuficientes para una valoración honesta. Preferimos abstenernos antes que fingir precisión con un DCF sobre flujos que no existen.";

  return {
    version: "pre_revenue_lens_v1",
    applicable: true,
    status,
    statusLabel: {
      ok: "Escenarios ponderados por probabilidad",
      expectations_only: "Solo expectativas implícitas en el precio",
      abstain: "Abstención: datos insuficientes",
    }[status],
    methodology: "probability_weighted_scenarios",
    methodologyLabel: "Escenarios ponderados + runway + milestone risk + dilución (no DCF tradicional)",
    summary,
    runway: {
      cashUsd,
      annualBurnUsd: annualBurn,
      runwayYears,
      runwayLabel: runwayYears !== null ? `${runwayYears.toFixed(1)} años de runway` : "Runway no calculable: falta caja o burn.",
    },
    milestones,
    milestoneSurvival,
    failureProbability,
    expectedDilution,
    scenarios,
    probabilityWeightedValuePerShare,
    upside,
    impliedExpectations,
    assumptions,
    missingInputs: [...new Set(missingInputs)],
    falsifiers: [
      runwayYears !== null && runwayYears < 1.5 ? "Una ampliación de capital en peores términos de lo asumido rompe el caso base." : null,
      milestones[0] ? `Fallo del hito "${milestones[0].label}" invalida la ponderación de escenarios.` : null,
      "Si el burn anual sube sin acortar el tiempo a escala, la dilución esperada queda corta.",
      somUsd !== null ? "Si el SOM declarado no se sostiene con evidencia externa, el valor base cae proporcionalmente." : null,
    ].filter(Boolean),
    disclaimer: "Metodología explícita para empresas tempranas: los números son escenarios falsificables, no una predicción puntual.",
  };
}
