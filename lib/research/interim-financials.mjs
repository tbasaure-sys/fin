// Cumulative interim figures from the newest pinned report. Never sum quarterly
// cash-flow frames: they commonly contain fiscal year-to-date rather than quarters.
const DAY=86400000;
const CONCEPTS={
 revenue:['RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet'],
 ebit:['OperatingIncomeLoss'],cfo:['NetCashProvidedByUsedInOperatingActivities'],
 capex:['PaymentsToAcquirePropertyPlantAndEquipment'],
 buybacks:['PaymentsForRepurchaseOfCommonStock'],
 // Total cash dividends only: common-stock dividends can exclude preferred stock.
 dividends:['PaymentsOfDividends'],
 cashChange:['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],
 cfi:['NetCashProvidedByUsedInInvestingActivities'],cff:['NetCashProvidedByUsedInFinancingActivities'],
};
const nonnegative=new Set(['revenue','capex','buybacks','dividends']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const days=(end,start)=>(Date.parse(end)-Date.parse(start))/DAY;
const nextDay=end=>new Date(Date.parse(end)+DAY).toISOString().slice(0,10);
const absent=(reason='MISSING_FACT')=>({value:null,unit:'USD',status:'unknown',reason,terms:[]});
const provenance=f=>f&&/^[a-f0-9]{64}$/.test(f.sourceHash||'')&&/^[a-f0-9]{64}$/.test(f.filingHash||'')
 &&/^https:\/\/www\.sec\.gov\//.test(f.url||'')&&finite(f.value);
function computed(value,terms,start,end,extra={}){
 if(!finite(value))return absent('INVALID_ARITHMETIC');
 return {value,unit:'USD',status:'derived',start,end,terms,
  availableAt:terms.map(t=>t.fact.availableAt).sort().at(-1),...extra};
}
function subtractCash(cash,investment){
 if(cash.value===null||investment.value===null)return absent('MISSING_CASH_OR_CAPEX');
 if(cash.start!==investment.start||cash.end!==investment.end||cash.terms.length!==investment.terms.length
  ||!cash.terms.every((t,i)=>t.coefficient===investment.terms[i].coefficient&&t.fact.start===investment.terms[i].fact.start
   &&t.fact.end===investment.terms[i].fact.end&&t.fact.accession===investment.terms[i].fact.accession))
  return absent('INCOMPATIBLE_CASH_AND_CAPEX');
 return computed(cash.value-investment.value,[...cash.terms,...investment.terms.map(t=>({...t,coefficient:-t.coefficient}))],cash.start,cash.end,
  {basis:cash.basis,formula:'operating_cash_minus_cash_ppe'});
}
function change(current,prior){
 if(current.value===null||prior.value===null)return absent('MISSING_COMPARATIVE');
 return computed(current.value-prior.value,[...current.terms,...prior.terms.map(t=>({...t,coefficient:-t.coefficient}))],current.start,current.end,
  {percentChange:prior.value>0?(current.value-prior.value)/prior.value:null,formula:'current_YTD_minus_prior_YTD'});
}

function cashRemainder(entries,formula,extra={}){
 if(entries.some(([cell])=>!cell||cell.value===null||!cell.terms.length))return absent('MISSING_CASH_ALLOCATION_INPUT');
 const terms=entries.flatMap(([cell,sign])=>cell.terms.map(t=>({...t,coefficient:t.coefficient*sign})));
 const anchor=terms[0].fact;
 if(!terms.every(t=>t.fact.unit==='USD'&&t.fact.start===anchor.start&&t.fact.end===anchor.end&&t.fact.accession===anchor.accession))
  return absent('INCOMPATIBLE_CASH_ALLOCATION_BASIS');
 return computed(entries.reduce((sum,[cell,sign])=>sum+sign*cell.value,0),terms,anchor.start,anchor.end,
  {basis:'same_interim_filing',formula,fundingAttribution:null,...extra});
}

export function interimFinancials({raw,dossier,history,sourceHash}){
 const base={version:'interim-financials-v1',scope:'latest_pinned_cumulative_report_not_PIT_history',predictiveClaim:false};
 const annual=history.at(-1),calendar=annual?.facts.revenue;
 const sources=dossier.sources.filter(s=>Date.parse(s.acceptedAt)<=Date.parse(dossier.asOf));
 const latest=sources.filter(s=>/^10-Q(?:\/A)?$/.test(s.form)&&Date.parse(s.periodEnd)>Date.parse(annual?.end))
  .sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)||b.acceptedAt.localeCompare(a.acceptedAt)||a.accession.localeCompare(b.accession))[0];
 if(!latest)return {...base,status:annual?'no_new_interim':'unresolved',reason:annual?'NO_NEW_INTERIM':'MISSING_ANNUAL_CALENDAR'};
 if(!provenance(calendar)||days(calendar.end,calendar.start)<330||days(calendar.end,calendar.start)>380)
  return {...base,status:'unresolved',reason:'MISSING_ANNUAL_CALENDAR'};
 const start=nextDay(annual.end),end=latest.periodEnd,duration=days(end,start);
 if(duration<60||duration>300||Date.parse(end)>Date.parse(latest.acceptedAt))
  return {...base,status:'unresolved',reason:'INCOMPATIBLE_FISCAL_CALENDAR',end,accession:latest.accession};
 const gaap=raw.facts?.['us-gaap']||{},metrics={};
 function pick(metric,concepts,prior=false,selectedConcept){
  for(const concept of selectedConcept?[selectedConcept]:concepts){
   const rows=(gaap[concept]?.units?.USD||[]).filter(r=>r.accn===latest.accession&&r.form===latest.form
    &&r.start===(prior?calendar.start:start)&&(!prior?r.end===end:
      Math.abs(days(r.end,r.start)-duration)<=8&&days(end,r.end)>=330&&days(end,r.end)<=380));
   if(!rows.length)continue;
   if(new Set(rows.map(r=>JSON.stringify([r.val,r.start,r.end]))).size!==1)return absent('CONFLICTED_FACT');
   const r=rows[0],fact={value:r.val,unit:'USD',start:r.start,end:r.end,availableAt:latest.acceptedAt,
    accession:latest.accession,concepts:[concept],url:latest.url,sourceHash,filingHash:latest.sha256,metric};
   if(!provenance(fact)||(nonnegative.has(metric)&&fact.value<0))return absent('INVALID_FACT');
   return {...fact,status:'reported',terms:[{coefficient:1,fact}],basis:'same_interim_filing'};
  }
  return absent();
 }
 for(const [metric,concepts] of Object.entries(CONCEPTS)){
  const current=pick(metric,concepts),prior=pick(metric,concepts,true,current.concepts?.[0]);
  // A missing/conflicted current tag must not invite an unrelated comparative tag.
  let delta=absent('MISSING_COMPARATIVE'),trailing=absent('MISSING_TRAILING_INPUT');
  if(current.value!==null&&prior.value!==null&&current.concepts[0]===prior.concepts[0]){
   delta=change(current,prior);
   const a=annual.facts[metric];
   const annualSource=sources.find(s=>s.accession===a?.accession);
   if(provenance(a)&&a.unit==='USD'&&a.start===calendar.start&&a.end===annual.end
    &&(!nonnegative.has(metric)||(a.value>=0&&a.value+current.value-prior.value>=0))
    &&a.concepts?.length===1&&a.concepts[0]===current.concepts[0]
    &&annualSource&&Date.parse(a.availableAt)<=Date.parse(latest.acceptedAt)
    &&days(end,prior.end)>=330&&days(end,prior.end)<=380){
    trailing=computed(a.value+current.value-prior.value,
     [{coefficient:1,fact:{...a,metric}},...current.terms,...prior.terms.map(t=>({...t,coefficient:-t.coefficient}))],nextDay(prior.end),end,
     {formula:'annual_plus_current_YTD_minus_prior_YTD',basis:'combined_filings_not_restatement_reconciled'});
   }else trailing=absent('INCOMPATIBLE_ANNUAL_BASIS');
  }
  metrics[metric]={current,prior,change:delta,trailing};
 }
 const cash=metrics.cfo,investment=metrics.capex;
 const current=subtractCash(cash.current,investment.current),prior=subtractCash(cash.prior,investment.prior);
 metrics.cashAfterCapex={current,prior,change:change(current,prior),trailing:subtractCash(cash.trailing,investment.trailing)};
 const allocations={},other={};
 for(const period of ['current','prior']){
  allocations[period]=cashRemainder([[cash[period],1],[investment[period],-1],[metrics.buybacks[period],-1],[metrics.dividends[period],-1]],
   'operating_cash_minus_cash_ppe_common_buybacks_total_dividends');
  other[period]=cashRemainder([[metrics.cashChange[period],1],[allocations[period],-1]],
   'reported_cash_change_minus_selected_residual',{classification:'unclassified_difference_not_economic_cause'});
 }
 metrics.cashAfterDistributions={...allocations,change:change(allocations.current,allocations.prior),trailing:absent('CUMULATIVE_ONLY')};
 metrics.otherCashMovements={...other,change:change(other.current,other.prior),trailing:absent('CUMULATIVE_ONLY')};
 // Activity totals already include the selected payments. Add those payments
 // back before adding the remaining activity subtotal to the allocation bridge.
 for(const [metric,entries,formula] of [
  ['otherInvesting',[['cfi',1],['capex',1]],'net_investing_plus_selected_cash_ppe'],
  ['otherFinancing',[['cff',1],['buybacks',1],['dividends',1]],'net_financing_plus_selected_distributions'],
  ['unclassifiedCashChange',[['cashChange',1],['cfo',-1],['cfi',-1],['cff',-1]],'reported_cash_change_minus_activity_totals'],
 ]){
  const cells={};
  for(const period of ['current','prior'])cells[period]=cashRemainder(entries.map(([id,factor])=>[metrics[id][period],factor]),formula,
   {classification:metric==='unclassifiedCashChange'?'unclassified_difference_not_economic_cause':'reported_activity_less_selected_payments'});
  metrics[metric]={...cells,change:change(cells.current,cells.prior),trailing:absent('CUMULATIVE_ONLY')};
 }
 return {...base,status:Object.values(metrics).some(m=>m.current.value!==null)?'available':'unresolved',
  start,end,annualEnd:annual.end,accession:latest.accession,availableAt:latest.acceptedAt,metrics};
}
