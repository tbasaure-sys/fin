// Accounting decomposition, not causal attribution or normalized free cash flow.
// Changes in operating assets subtract from cash; changes in operating liabilities
// add to cash. Inputs are reported cash-flow changes, NEVER balance-sheet deltas.
const COMPONENTS = [['netIncome',1],['da',1],['sbc',1],['receivablesChange',-1],['inventoryChange',-1],['payablesChange',1]];
const finite = value => typeof value === 'number' && Number.isFinite(value);

// Adapt validated single-filing cumulative facts to the same accounting identity.
// Do not annualize, reuse the trailing reconstruction, or substitute annual data.
export function interimCashChangeBridge(interim,supportedBusiness){
 const metrics=interim?.metrics||{},evidence={},comparisons={};
 const days=(end,start)=>(Date.parse(end)-Date.parse(start))/86400000;
 const raw=(id,period)=>{
  const cell=metrics[id]?.[period],f=cell?.terms?.[0]?.fact;
  if(cell?.terms?.length!==1||cell.terms[0].coefficient!==1||!finite(cell.value)||cell.value!==f?.value
   ||cell.unit!=='USD'||f.unit!=='USD'||f.accession!==interim.accession
   ||f.availableAt!==interim.availableAt||Date.parse(f.end)>Date.parse(f.availableAt)
   ||!/^[a-f0-9]{64}$/.test(f.sourceHash||'')||!/^[a-f0-9]{64}$/.test(f.filingHash||'')
   ||!Array.isArray(f.concepts)||!f.concepts.length||!/^https:\/\/www\.sec\.gov\//.test(f.url||''))return null;
  const duration=days(f.end,f.start);
  if(!finite(duration)||duration<60||duration>300)return null;
  if(period==='current'&&(f.start!==interim.start||f.end!==interim.end))return null;
  return f;
 };
 const a=raw('cfo','prior'),b=raw('cfo','current');
 const periods=a&&b?[{end:a.end},{end:b.end}]:[];
 for(const id of ['cfo','capex',...COMPONENTS.map(([id])=>id)]){
  const prior=raw(id,'prior'),current=raw(id,'current');
  const compatible=prior&&current&&days(current.end,prior.end)>=330&&days(current.end,prior.end)<=380
   &&Math.abs(days(current.end,current.start)-days(prior.end,prior.start))<=8
   &&prior.concepts.join()===current.concepts.join()&&prior.filingHash===current.filingHash&&prior.sourceHash===current.sourceHash;
  comparisons[id]={status:compatible?'comparable':'unresolved',change:compatible?current.value-prior.value:null};
  if(prior)evidence[`${prior.end}:${id}`]=prior;
  if(current)evidence[`${current.end}:${id}`]=current;
 }
 comparisons.cashAfterCapex={status:comparisons.capex.status==='comparable'&&comparisons.cfo.status==='comparable'?'comparable':'unresolved'};
 const result=cashChangeBridge({periods,comparisons,evidence,supportedBusiness});
 if(result.status!=='available')return {...result,basis:'cumulative'};
 const refs=rows=>rows.map(r=>({...r,period:r.end===a.end?'prior':'current'}));
 return {...result,basis:'cumulative',periods:{prior:{start:a.start,end:a.end},current:{start:b.start,end:b.end}},
  components:result.components.map(c=>({...c,evidence:refs(c.evidence)})),
  capex:result.capex?{...result.capex,evidence:refs(result.capex.evidence)}:null,
  operatingCashEvidence:refs(result.operatingCashEvidence),cashAfterCapexEvidence:refs(result.cashAfterCapexEvidence)};
}

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
      fact.end===anchors[i].end && fact.unit===anchors[i].unit && fact.accession===anchors[i].accession &&
      fact.filingHash===anchors[i].filingHash && fact.sourceHash===anchors[i].sourceHash && fact.availableAt===anchors[i].availableAt))
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
