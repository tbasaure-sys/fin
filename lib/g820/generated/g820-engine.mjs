const VALID_FACT_STATUSES = new Set([
  'known_value', 'known_pass', 'known_fail', 'unknown', 'not_applicable', 'stale', 'conflicted', 'invalid',
])
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value))
const round = (value, digits = 6) => finite(value) ? Number(value.toFixed(digits)) : null

export function fact(status, value = null, details = {}) {
  if (!VALID_FACT_STATUSES.has(status)) throw new Error(`Fact status no permitido: ${status}`)
  if (status === 'known_value' && !finite(value)) throw new Error('known_value requiere un numero finito.')
  return { status, value, ...details }
}

const isKnown = (item) => item?.status === 'known_value' || item?.status === 'known_pass' || item?.status === 'known_fail'
const isPass = (item) => item?.status === 'known_pass'
const isFail = (item) => item?.status === 'known_fail'
const isUnknown = (item) => !item || !isKnown(item)
const SURVIVAL_GATES = ['minimumCash24m', 'bearInterestCoverage', 'maturityWall', 'mandatoryEquityRaise']
const hasPositiveEconomicGap = (input) => {
  const gap = input.marketClock?.priceBusinessGap
  return gap?.status === 'known_value' && (gap.rawGap ?? gap.value) > 0
}

function weightedQuantile(points, quantile) {
  const ordered = points
    .filter((point) => finite(point.value) && finite(point.weight) && point.weight > 0)
    .sort((left, right) => left.value - right.value)
  const total = ordered.reduce((sum, point) => sum + point.weight, 0)
  if (!total) return null
  const target = total * quantile
  let cumulative = 0
  for (const point of ordered) {
    cumulative += point.weight
    if (cumulative >= target) return point.value
  }
  return ordered.at(-1).value
}

function median(values) {
  const ordered = values.filter(finite).sort((a, b) => a - b)
  if (!ordered.length) return null
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function scenarioWeight(config, index) {
  return config.valuation.scenarioWeights?.[index] ?? 1 / 3
}

function projectCashFlowValue({ cashFlow, growth, discountRate, horizon, terminalGrowth }) {
  let presentValue = 0
  let current = cashFlow
  for (let year = 1; year <= horizon; year += 1) {
    current *= 1 + growth
    presentValue += current / ((1 + discountRate) ** year)
  }
  const terminal = current * (1 + terminalGrowth) / (discountRate - terminalGrowth)
  const discountedTerminal = terminal / ((1 + discountRate) ** horizon)
  return {
    value: presentValue + discountedTerminal,
    terminalValueShare: (presentValue + discountedTerminal) > 0 ? discountedTerminal / (presentValue + discountedTerminal) : 1,
  }
}

function modelSummary(id, family, scenarios) {
  const points = scenarios.map((scenario) => ({ value: scenario.value, weight: scenario.weight }))
  return {
    id,
    family,
    scenarioCount: scenarios.length,
    floor: round(weightedQuantile(points, 0.20), 4),
    base: round(weightedQuantile(points, 0.50), 4),
    upside: round(weightedQuantile(points, 0.75), 4),
    terminalValueShare: round(weightedQuantile(scenarios.map((scenario) => ({
      value: scenario.terminalValueShare,
      weight: scenario.weight,
    })), 0.50), 4),
    scenarios,
  }
}

export function buildValuationLattice(owner, config) {
  const shares = owner?.shares
  const conservativeOwnerEarnings = owner?.conservativeOwnerEarnings
  const normalizedOwnerEarnings = owner?.normalizedOwnerEarnings
  const ebita = owner?.ebita
  const netDebt = owner?.netDebt
  if (![shares, conservativeOwnerEarnings, normalizedOwnerEarnings, ebita, netDebt].every(finite) || shares <= 0
    || conservativeOwnerEarnings <= 0 || normalizedOwnerEarnings <= 0 || ebita <= 0) {
    return {
      status: 'unknown', ivFloor: null, ivBase: null, ivUpside: null, methods: [], scenarioCount: 0,
      blockers: ['positive_owner_earnings_and_ebita_required'],
    }
  }
  const adjustment = config.archetypeAdjustments[owner.archetype] ?? config.archetypeAdjustments.unresolved
  const dcfScenarios = []
  const epvScenarios = []
  const horizon = config.valuation.horizonYears
  const terminalGrowth = config.valuation.terminalGrowth
  for (let growthIndex = 0; growthIndex < config.valuation.growthScenarios.length; growthIndex += 1) {
    for (let powerIndex = 0; powerIndex < config.valuation.earningPowerScenarios.length; powerIndex += 1) {
      for (let discountIndex = 0; discountIndex < config.valuation.discountRateScenarios.length; discountIndex += 1) {
        const growth = config.valuation.growthScenarios[growthIndex] + adjustment.growthShift
        const power = config.valuation.earningPowerScenarios[powerIndex]
        const discountRate = Math.max(
          terminalGrowth + 0.02,
          config.valuation.discountRateScenarios[discountIndex] + adjustment.discountRateShift,
        )
        const weight = scenarioWeight(config, growthIndex) * scenarioWeight(config, powerIndex) * scenarioWeight(config, discountIndex)
        const dcf = projectCashFlowValue({
          cashFlow: ((conservativeOwnerEarnings * 0.6 + normalizedOwnerEarnings * 0.4) * power) / shares,
          growth,
          discountRate,
          horizon,
          terminalGrowth,
        })
        dcfScenarios.push({
          growth, power, discountRate, weight, value: Math.max(0, dcf.value), terminalValueShare: dcf.terminalValueShare,
        })
        const midCycleAdjustment = Math.max(0.5, 1 + growth * 2)
        const enterpriseValue = (ebita * (1 - config.valuation.taxRate) * power * midCycleAdjustment) / discountRate
        epvScenarios.push({
          growth, power, discountRate, weight,
          value: Math.max(0, (enterpriseValue - netDebt) / shares),
          terminalValueShare: 0,
        })
      }
    }
  }
  const methods = [
    modelSummary('owner_earnings_dcf', 'owner_cash_flow', dcfScenarios),
    modelSummary('ebita_earning_power', 'enterprise_earning_power', epvScenarios),
  ]
  const combined = methods.flatMap((method) => method.scenarios.map((scenario) => ({
    value: scenario.value,
    weight: scenario.weight / methods.length,
  })))
  const ivFloor = weightedQuantile(combined, 0.20)
  const ivBase = weightedQuantile(combined, 0.50)
  const ivUpside = weightedQuantile(combined, 0.75)
  const terminalValueShare = methods.find((method) => method.id === 'owner_earnings_dcf')?.terminalValueShare ?? 1
  const baseDenominator = Math.max(ivBase ?? 0, 0.000001)
  const spread = clamp(((ivBase ?? 0) - (ivFloor ?? 0)) / baseDenominator)
  const powerMedians = config.valuation.earningPowerScenarios.map((power) => median(
    [...dcfScenarios, ...epvScenarios].filter((scenario) => scenario.power === power).map((scenario) => scenario.value),
  ))
  const rateMedians = config.valuation.discountRateScenarios.map((rate) => median(
    [...dcfScenarios, ...epvScenarios]
      .filter((scenario) => Math.abs(scenario.discountRate - (rate + adjustment.discountRateShift)) < 1e-9)
      .map((scenario) => scenario.value),
  ))
  const sensitivity = (values) => {
    const usable = values.filter(finite)
    return usable.length ? clamp((Math.max(...usable) - Math.min(...usable)) / baseDenominator) : 1
  }
  const fragility = clamp(0.40 * spread + 0.25 * terminalValueShare + 0.20 * sensitivity(powerMedians) + 0.15 * sensitivity(rateMedians))
  const stressFactors = [0.90, 0.80, 0.82, 0.86, 0.90, 0.80, 0.92, 0.85]
  const robustnessPassRate = finite(owner.price) && owner.price > 0
    ? stressFactors.filter((factor) => ivFloor * factor > owner.price).length / stressFactors.length
    : null
  const supporting = methods.filter((method) => finite(owner.price) && method.floor > owner.price)
  const extremeOvervaluation = methods.some((method) => finite(owner.price)
    && method.base < owner.price * config.thresholds.maximumExtremeOvervaluationRatio)
  return {
    status: 'known_value',
    ivFloor: round(ivFloor, 4),
    ivBase: round(ivBase, 4),
    ivUpside: round(ivUpside, 4),
    methods: methods.map(({ scenarios, ...method }) => method),
    scenarioCount: dcfScenarios.length + epvScenarios.length,
    independentFamiliesSupporting: new Set(supporting.map((method) => method.family)).size,
    extremeOvervaluation,
    terminalValueShare: round(terminalValueShare, 4),
    fragility: round(fragility, 4),
    robustnessPassRate: round(robustnessPassRate, 4),
    modelVersion: config.engineVersion,
  }
}

export function calculateRequiredMos(risks, config) {
  const weights = config.requiredMos.weights
  let lower = config.requiredMos.base
  let upper = config.requiredMos.base
  const unknownFactors = []
  for (const [key, weight] of Object.entries(weights)) {
    const item = risks?.[key]
    if (item?.status === 'known_value' && finite(item.value)) {
      const bounded = clamp(item.value)
      lower += weight * bounded
      upper += weight * bounded
    } else {
      unknownFactors.push(key)
      upper += weight
    }
  }
  return {
    status: unknownFactors.length ? 'interval' : 'known_value',
    lower: round(Math.min(config.requiredMos.cap, lower), 6),
    upper: round(Math.min(config.requiredMos.cap, upper), 6),
    unknownFactors,
  }
}

export function assertOwnerClockChange({ before, after, evidenceEvents = [] }) {
  if (!finite(before?.ivFloor) || !finite(after?.ivFloor) || before.ivFloor === after.ivFloor) return true
  const completeEvidence = evidenceEvents.some((event) => event?.id && event?.assumption && finite(event?.impact) && event?.source)
  if (!completeEvidence || before?.modelVersion === after?.modelVersion) {
    throw new Error('IV_floor cambio sin evidencia economica nueva, supuesto, impacto, fuente y version de modelo nueva.')
  }
  return true
}

function geometricMean(values) {
  if (!values.length || values.some((value) => !finite(value) || value <= 0)) return null
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}

function firstNonPass(input, config, requiredMos, safetySurplus, mrMarketScore) {
  const survivalEntry = SURVIVAL_GATES.map((key) => [key, input.survival?.[key]]).find(([, value]) => !isPass(value))
  if (survivalEntry) return `${survivalEntry[0]}:${survivalEntry[1]?.status ?? 'unknown'}`
  if (!finite(input.evidence?.quality) || input.evidence.quality < config.thresholds.dataQuality) return 'evidence_quality'
  if ((input.marketClock?.priceDamageCoverage ?? 0) < config.thresholds.minimumDecisionCoverage) return 'market_clock_coverage'
  if ((input.ownerClock?.businessDamageCoverage ?? 0) < config.thresholds.minimumDecisionCoverage) return 'owner_clock_coverage'
  if (!isPass(input.reflexivity)) return `reflexivity:${input.reflexivity?.status ?? 'unknown'}`
  if ((input.valuation?.independentFamiliesSupporting ?? 0) < config.thresholds.minimumIndependentValuationFamilies) return 'independent_valuation_families'
  if (input.valuation?.extremeOvervaluation) return 'extreme_overvaluation_model'
  if ((input.valuation?.robustnessPassRate ?? 0) < config.thresholds.robustnessPassRate) return 'robustness_pass_rate'
  if (!finite(safetySurplus) || safetySurplus <= 0) return `safety_surplus_vs_required_mos_${requiredMos.upper}`
  if (!hasPositiveEconomicGap(input)) return 'no_positive_price_business_gap'
  if (mrMarketScore < config.thresholds.mrMarketScore) return 'mr_market_score'
  if ((input.noReratingIrr?.value ?? -Infinity) < config.thresholds.noReratingIrr) return 'no_rerating_irr'
  if (input.structuralRisks?.some((risk) => risk.severity === 'red')) return 'structural_red_flag'
  return null
}

export function evaluateG820Candidate(input, config) {
  const marketFacts = ['priceDamage', 'priceBusinessGap', 'priceValueGap']
  const mrMarketScore = marketFacts.reduce((sum, key) => {
    const item = input.marketClock?.[key]
    return sum + (item?.status === 'known_value' ? item.value * (config.mrMarketWeights[key] ?? 0) : 0)
  }, 0)
  const marketCoverage = marketFacts.reduce((sum, key) => (
    sum + (input.marketClock?.[key]?.status === 'known_value' ? (config.mrMarketWeights[key] ?? 0) : 0)
  ), 0)
  const actualMos = finite(input.valuation?.price) && finite(input.valuation?.ivFloor) && input.valuation.ivFloor > 0
    ? 1 - input.valuation.price / input.valuation.ivFloor
    : null
  const requiredMos = calculateRequiredMos({
    ...input.risks,
    valuationFragility: finite(input.valuation?.fragility) ? knownFact(input.valuation.fragility) : fact('unknown'),
  }, config)
  const archetypeShift = config.archetypeAdjustments[input.archetype]?.requiredMosShift
    ?? config.archetypeAdjustments.unresolved.requiredMosShift
  requiredMos.lower = round(Math.min(config.requiredMos.cap, requiredMos.lower + archetypeShift), 6)
  requiredMos.upper = round(Math.min(config.requiredMos.cap, requiredMos.upper + archetypeShift), 6)
  const safetySurplus = finite(actualMos) ? actualMos - requiredMos.upper : null
  const survivalValues = SURVIVAL_GATES.map((key) => input.survival?.[key])
  const survivalStatus = survivalValues.some(isFail) ? 'fail' : survivalValues.some(isUnknown) ? 'unknown' : 'pass'
  const valuationPass = input.valuation?.independentFamiliesSupporting >= config.thresholds.minimumIndependentValuationFamilies
    && !input.valuation?.extremeOvervaluation
    && input.valuation?.terminalValueShare <= config.thresholds.maximumTerminalValueShare
    && input.valuation?.robustnessPassRate >= config.thresholds.robustnessPassRate
  const structuralRed = input.structuralRisks?.some((risk) => risk.severity === 'red') ?? false
  const decisionCoverage = Math.min(
    input.marketClock?.priceDamageCoverage ?? 0,
    input.ownerClock?.businessDamageCoverage ?? 0,
    marketCoverage,
  )
  const materialUnknowns = []
  for (const key of SURVIVAL_GATES) if (isUnknown(input.survival?.[key])) materialUnknowns.push(`survival.${key}`)
  if (!finite(input.evidence?.quality)) materialUnknowns.push('evidence.quality')
  if (isUnknown(input.reflexivity)) materialUnknowns.push('reflexivity')
  if (!finite(actualMos)) materialUnknowns.push('valuation.ivFloor')
  if (isUnknown(input.noReratingIrr)) materialUnknowns.push('noReratingIrr')
  const dataException = input.evidence?.quality < config.thresholds.dataQuality
    || decisionCoverage < config.thresholds.minimumDecisionCoverage
    || materialUnknowns.length > 0
  const chapter8 = mrMarketScore >= config.thresholds.mrMarketScore
    && decisionCoverage >= config.thresholds.minimumDecisionCoverage
    && hasPositiveEconomicGap(input)
  const chapter20 = survivalStatus === 'pass'
    && valuationPass
    && finite(safetySurplus) && safetySurplus > 0
    && isPass(input.reflexivity)
    && !structuralRed
    && input.noReratingIrr?.status === 'known_value'
    && input.noReratingIrr.value >= config.thresholds.noReratingIrr
  let category
  if (input.thesisBroken) category = 'THESIS_BROKEN'
  else if (survivalStatus === 'fail' && (isFail(input.survival?.mandatoryEquityRaise) || isFail(input.reflexivity))) category = 'FUNDING_DEPENDENT'
  else if (survivalStatus === 'fail') category = 'FALLING_KNIFE'
  else if (structuralRed) category = 'CHEAP_BUT_STRUCTURALLY_IMPAIRED'
  else if (dataException) category = 'DATA_EXCEPTION'
  else if (chapter8 && chapter20) category = 'RESEARCH_NOW'
  else category = 'WATCH_FOR_PRICE'
  const firstRejection = firstNonPass(input, config, requiredMos, safetySurplus, mrMarketScore)
  const researchTasks = []
  if (materialUnknowns.some((key) => key.startsWith('survival.')) || isUnknown(input.reflexivity)) researchTasks.push('debt_maturities_and_24m_cash_uses')
  if (!finite(actualMos)) researchTasks.push('reconcile_share_basis_and_owner_earnings')
  if (input.risks?.governanceRisk?.status !== 'known_value') researchTasks.push('proxy_related_parties_and_senior_claims')
  if (!chapter8) researchTasks.push('verify_price_business_divergence_with_fresh_history')
  if (structuralRed) researchTasks.push('resolve_structural_counterevidence')
  if (finite(safetySurplus) && safetySurplus <= 0) researchTasks.push('wait_for_conservative_margin_of_safety')
  if (input.valuation?.independentFamiliesSupporting < 2) researchTasks.push('reconcile_both_valuation_families')
  const priority = category === 'RESEARCH_NOW' ? round(geometricMean([
    Math.max(1, mrMarketScore),
    Math.max(1, clamp(safetySurplus / 0.30) * 100),
    100,
    Math.max(1, clamp(input.noReratingIrr.value / 0.20) * 100),
    Math.max(1, input.evidence.quality),
    Math.max(1, 100 - (input.structuralRisks?.length ?? 0) * 10),
  ]), 2) : null
  return {
    engineVersion: config.engineVersion,
    identity: input.identity,
    asOf: input.asOf,
    archetype: input.archetype,
    category,
    priority,
    dualKey: { chapter8, chapter20 },
    mrMarket: {
      score: round(mrMarketScore, 2),
      coverage: round(marketCoverage, 4),
      priceDamage: input.marketClock?.priceDamage ?? fact('unknown'),
      businessDamage: input.ownerClock?.businessDamage ?? fact('unknown'),
      priceBusinessGap: input.marketClock?.priceBusinessGap ?? fact('unknown'),
      priceValueGap: input.marketClock?.priceValueGap ?? fact('unknown'),
    },
    safety: {
      actualMos: round(actualMos, 6),
      requiredMos,
      surplusConservative: round(safetySurplus, 6),
    },
    valuation: input.valuation,
    survival: { status: survivalStatus, gates: input.survival },
    reflexivity: input.reflexivity,
    noReratingIrr: input.noReratingIrr,
    structuralRisks: input.structuralRisks ?? [],
    evidence: { ...input.evidence, decisionCoverage: round(decisionCoverage, 4) },
    firstRejection,
    blockers: [...(input.evidence?.blockers ?? []), ...materialUnknowns],
    claimLicense: input.evidence?.claimLicense ?? 'C0_REPORTED_ONLY',
    researchAction: category === 'RESEARCH_NOW' ? 'deepen'
      : category === 'WATCH_FOR_PRICE' ? 'wait_trigger'
        : category === 'DATA_EXCEPTION' ? 'abstain'
          : 'reject',
    researchPlan: {
      lane: category === 'RESEARCH_NOW' ? 'deepen'
        : category === 'DATA_EXCEPTION' ? 'resolve_evidence'
          : category === 'WATCH_FOR_PRICE' ? chapter8 ? 'wait_price' : 'wait_price_and_recognition' : 'do_not_advance',
      tasks: researchTasks,
      mosTriggerPrice: finite(input.valuation?.ivFloor) ? round(input.valuation.ivFloor * (1 - requiredMos.upper), 4) : null,
      triggerIsBuyPrice: false,
      priceAloneSufficient: false,
    },
  }
}

const knownFact = (value) => fact('known_value', value)

export function calculateNoReratingIrr({ price, shares, conservativeOwnerEarnings, revenueGrowth, config }) {
  if (![price, shares, conservativeOwnerEarnings].every(finite) || price <= 0 || shares <= 0 || conservativeOwnerEarnings <= 0) return fact('unknown')
  const earnings = conservativeOwnerEarnings / shares
  const currentMultiple = price / earnings
  const exitMultiple = Math.min(currentMultiple, config.valuation.conservativeExitMultiple)
  const growth = finite(revenueGrowth) ? clamp(revenueGrowth / 100, -0.02, 0.01) : -0.02
  let current = earnings
  let retained = 0
  const flows = []
  for (let year = 1; year <= config.valuation.horizonYears; year += 1) {
    current *= 1 + growth
    retained += current * (1 - config.valuation.distributionRate)
    flows.push(current * config.valuation.distributionRate)
  }
  flows[flows.length - 1] += current * exitMultiple + retained
  let low = -0.999
  let high = 100
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const rate = (low + high) / 2
    const pv = flows.reduce((sum, flow, i) => sum + flow / (1 + rate) ** (i + 1), 0)
    if (pv > price) low = rate; else high = rate
  }
  return fact('known_value', round((low + high) / 2), { exitMultiple: round(exitMultiple, 3), currentMultiple: round(currentMultiple, 3),
    basis: 'same_or_lower_multiple_plus_retained_and_distributed_owner_earnings',
    limitation: 'historical_median_multiple_unavailable; retained_cash_no_leakage_and_growth_are_model_assumptions' })
}

export function repriceG820Candidate(context, quote, config) {
  if (!finite(quote?.price) || quote.price <= 0) throw new Error('Positive quote required')
  const input = structuredClone(context.input)
  const valuation = input.valuation
  valuation.price = quote.price
  const methods = valuation.methods ?? []
  valuation.independentFamiliesSupporting = new Set(methods.filter((method) => method.floor > quote.price).map((method) => method.family)).size
  valuation.extremeOvervaluation = methods.some((method) => method.base < quote.price * config.thresholds.maximumExtremeOvervaluationRatio)
  const factors = [0.90, 0.80, 0.82, 0.86, 0.90, 0.80, 0.92, 0.85]
  valuation.robustnessPassRate = finite(valuation.ivFloor) ? factors.filter((factor) => valuation.ivFloor * factor > quote.price).length / factors.length : null
  input.noReratingIrr = calculateNoReratingIrr({ ...context.owner, price: quote.price, config })
  // A quote is not a refreshed cross-sectional market clock or a new filing.
  input.asOf = { ...input.asOf, price: quote.asOf }
  const historyAge = (Date.parse(quote.asOf) - Date.parse(input.asOf.market)) / 86400000
  if (!finite(historyAge) || historyAge > 7) {
    input.marketClock.priceDamageCoverage = 0
    input.evidence.blockers = [...input.evidence.blockers, 'market_clock.full_history_refresh_required']
  }
  return evaluateG820Candidate(input, config)
}
