// Explicit FCFF kernel. No priors, imputation, random samples or language model.
export const OPERATING_DCF_VERSION = 'aurora_operating_fcff_v1';

export function evaluateOperatingDcf(inputs, assumptions) {
  const { revenue, cash, debt, financeLeases, shares } = inputs;
  const { growth, margin, taxRate, reinvestment, discountRate, terminalGrowth, terminalRoic, dilution, years } = assumptions;
  if (![revenue, cash, debt, financeLeases, shares, growth, margin, taxRate, reinvestment, discountRate, terminalGrowth, terminalRoic, dilution, years].every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Inputs DCF incompletos.');
  if (revenue <= 0 || shares <= 0 || cash < 0 || debt < 0 || financeLeases < 0 || !Number.isInteger(years) || years < 1 || years > 20 || growth <= -1 || margin < 0 || margin > 1 || taxRate < 0 || taxRate >= 1 || reinvestment < 0 || reinvestment >= 1 || dilution < 0 || dilution > .1 || discountRate <= terminalGrowth || terminalGrowth < 0 || terminalRoic <= terminalGrowth) throw new Error('Supuestos DCF incompatibles: revise descuento, crecimiento y reinversión.');
  let projectedRevenue = revenue;
  let presentValue = 0;
  const projections = [];
  for (let year = 1; year <= years; year++) {
    // First year's growth is the hypothesis; it fades to terminal growth.
    const annualGrowth = years === 1 ? growth : growth + (terminalGrowth - growth) * (year - 1) / (years - 1);
    projectedRevenue *= 1 + annualGrowth;
    const nopat = projectedRevenue * margin * (1 - taxRate);
    const netReinvestment = nopat * reinvestment;
    const fcff = nopat - netReinvestment;
    const pv = fcff / (1 + discountRate) ** year;
    presentValue += pv;
    projections.push({ year, revenue: projectedRevenue, annualGrowth, nopat, netReinvestment, fcff, presentValue: pv });
  }
  const terminalReinvestment = terminalGrowth / terminalRoic;
  const terminalFcff = projectedRevenue * (1 + terminalGrowth) * margin * (1 - taxRate) * (1 - terminalReinvestment);
  const terminalValue = terminalFcff / (discountRate - terminalGrowth);
  const terminalPresentValue = terminalValue / (1 + discountRate) ** years;
  const enterpriseValue = presentValue + terminalPresentValue;
  const netDebt = debt + financeLeases - cash;
  const equityValue = enterpriseValue - netDebt;
  const effectiveShares = shares * (1 + dilution) ** years;
  return { version: OPERATING_DCF_VERSION, valuePerShare: equityValue / effectiveShares, enterpriseValue, equityValue, netDebt, effectiveShares, terminalPresentValue, terminalShare: terminalPresentValue / enterpriseValue, terminalReinvestment, projections };
}
