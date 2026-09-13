// Accounting decomposition, not causal attribution or normalized free cash flow.
// Changes in operating assets subtract from cash; changes in operating liabilities
// add to cash. Inputs are reported cash-flow changes, NEVER balance-sheet deltas.
const COMPONENTS = [['netIncome',1],['da',1],['sbc',1],['receivablesChange',-1],['inventoryChange',-1],['payablesChange',1]];
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function cashChangeBridge({periods, comparisons, evidence, supportedBusiness}) {
  const base = {version:'cash-change-bridge-v1',explanationComplete:false,
    claim:'arithmetic_contributions_not_economic_causes',unit:'USD',
    scope:'selected_reported_components_with_unclassified_difference'};
  if (!supportedBusiness) return {...base,status:'not_applicable'};
  const prior=periods.at(-2),latest=periods.at(-1);
  if (!prior || !latest || comparisons.cfo?.status!=='comparable' || !finite(comparisons.cfo.change))
    return {...base,status:'unresolved',reason:'INCOMPATIBLE_CASHFLOW_ENDPOINTS'};
  const from=prior.end,to=latest.end;
  const refs = metric => [from,to].map(end => ({end,metric}));
  const keys = metric => [from,to].map(end => `${end}:${metric}`);
  const anchors=keys('cfo').map(key => evidence[key]);
  const components=[],missingComponents=[];
  function component(id,factor) {
    if (comparisons[id]?.status!=='comparable') return {id,reason:'MISSING_OR_NONCOMPARABLE_FACT'};
    const facts=keys(id).map(key => evidence[key]);
    if (!facts.every((fact,i) => fact && anchors[i] && fact.start===anchors[i].start &&
      fact.end===anchors[i].end && fact.unit===anchors[i].unit && fact.accession===anchors[i].accession))
      return {id,reason:'INCOMPATIBLE_CASHFLOW_BASIS'};
    const effect=factor*comparisons[id].change;
    if (!finite(effect)) return {id,reason:'INVALID_ARITHMETIC'};
    return {id,factor,fromValue:facts[0].value,toValue:facts[1].value,effect,
      evidenceKeys:keys(id),evidence:refs(id)};
  }
  for (const [id,factor] of COMPONENTS) {
    const row=component(id,factor);
    if (row.reason) missingComponents.push(row); else components.push(row);
  }
  const operatingCashChange=comparisons.cfo.change;
  const unclassified=operatingCashChange-components.reduce((sum,c)=>sum+c.effect,0);
  if (!finite(unclassified)) return {...base,status:'unresolved',reason:'INVALID_ARITHMETIC'};
  const investment=component('capex',-1);
  const capex=!investment.reason && comparisons.cashAfterCapex?.status==='comparable' &&
    finite(operatingCashChange+investment.effect) ? investment : null;
  return {...base,status:'available',from,to,operatingCashChange,operatingCashEvidence:refs('cfo'),
    components,missingComponents,
    unexplained:{value:unclassified,method:'difference_not_classification',
      evidenceKeys:[...keys('cfo'),...components.flatMap(c=>c.evidenceKeys)]},
    capex,cashAfterCapexChange:capex?operatingCashChange+capex.effect:null,
    cashAfterCapexEvidence:capex?[...refs('cfo'),...refs('capex')]:[]};
}
