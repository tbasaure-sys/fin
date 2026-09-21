// Reported annual facts, in the issuer's reporting currency. No currency conversion.
export const METRICS = [
  {id:'revenue', es:'Ingresos', en:'Revenue', gaap:['RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet'], ifrs:['RevenueFromContractsWithCustomers','Revenue']},
  {id:'operatingIncome', es:'Resultado operativo', en:'Operating income', gaap:['OperatingIncomeLoss'], ifrs:['ProfitLossFromOperatingActivities']},
  {id:'netIncome', es:'Resultado atribuible al accionista', en:'Net income to shareholders', gaap:['NetIncomeLoss'], ifrs:['ProfitLossAttributableToOwnersOfParent']},
  {id:'operatingCash', es:'Caja operativa', en:'Operating cash flow', gaap:['NetCashProvidedByUsedInOperatingActivities'], ifrs:['CashFlowsFromUsedInOperatingActivities']},
  {id:'capex', es:'Compras de propiedad y equipo', en:'Property and equipment purchases', gaap:['PaymentsToAcquirePropertyPlantAndEquipment'], ifrs:['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']},
  {id:'cash', es:'Efectivo y equivalentes', en:'Cash and equivalents', instant:true, gaap:['CashAndCashEquivalentsAtCarryingValue'], ifrs:['CashAndCashEquivalents']},
  {id:'assets', es:'Activos', en:'Assets', instant:true, gaap:['Assets'], ifrs:['Assets']},
  {id:'liabilities', es:'Pasivos', en:'Liabilities', instant:true, gaap:['Liabilities'], ifrs:['Liabilities']},
  {id:'equity', es:'Patrimonio total', en:'Total equity', instant:true, gaap:['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','StockholdersEquity'], ifrs:['Equity']},
];
const annual = form => /^(10-K|20-F|40-F)(\/A)?$/.test(form);
export function normalizeCompanyFinancials(raw, ticker, asOf = new Date().toISOString()) {
  const cutoff = Date.parse(asOf), cik=Number(raw.cik);
  if(!Number.isFinite(cutoff)||!Number.isSafeInteger(cik)||cik<1)throw Error('INVALID_FINANCIALS');
  const namespace = raw.facts?.['ifrs-full'] ? 'ifrs-full' : 'us-gaap';
  const facts=raw.facts?.[namespace]||{}, key=namespace==='ifrs-full'?'ifrs':'gaap';
  const valid=r=>annual(r.form)&&typeof r.val==='number'&&Number.isFinite(r.val)&&/^\d{10}-\d{2}-\d{6}$/.test(r.accn)&&Number.isFinite(Date.parse(r.filed))&&Date.parse(r.filed)<=cutoff&&Number.isFinite(Date.parse(r.end))&&Date.parse(r.end)<=Date.parse(r.filed);
  const duration=r=>(Date.parse(r.end)-Date.parse(r.start))/86400000;
  const revenueCurrencies=METRICS[0][key].flatMap(concept=>Object.entries(facts[concept]?.units||{}).flatMap(([unit,rows])=>rows.filter(r=>valid(r)&&duration(r)>=330&&duration(r)<=380).map(r=>({unit,end:r.end}))));
  revenueCurrencies.sort((a,b)=>b.end.localeCompare(a.end));
  const units=[...new Set(revenueCurrencies.filter(r=>r.end===revenueCurrencies[0]?.end).map(r=>r.unit))];
  // Ambiguous reporting currencies are exposed, never silently relabeled USD.
  const currency=units.length===1 ? units[0] : null;
  const metrics=METRICS.map(metric=>{
    const candidates=metric[key].flatMap((concept,priority)=>(facts[concept]?.units?.[currency]||[]).filter(r=>valid(r)&&(metric.instant?!r.start:duration(r)>=330&&duration(r)<=380)).map(r=>({...r,concept,priority})));
    candidates.sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed)||a.priority-b.priority);
    const points=[];
    for(const row of candidates){
      if(points.some(p=>p.end===row.end))continue;
      const tied=candidates.filter(r=>r.end===row.end&&r.filed===row.filed&&r.priority===row.priority&&r.start===row.start);
      const conflict=new Set(tied.map(r=>r.val)).size>1;
      points.push({value:conflict?null:row.val,conflict,unit:currency,start:row.start||null,end:row.end,filed:row.filed,form:row.form,concept:row.concept,accession:row.accn,
        url:`https://www.sec.gov/Archives/edgar/data/${cik}/${row.accn.replaceAll('-','')}/${row.accn}-index.html`});
    }
    return {id:metric.id,es:metric.es,en:metric.en,instant:!!metric.instant,points:points.slice(0,10)};
  });
  const periods=[...new Set(metrics.flatMap(m=>m.points.map(p=>p.end)))].sort().reverse().slice(0,10);
  return {ticker,name:raw.entityName,cik,asOf,namespace,currency,periods,metrics,sourceUrl:`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`,basis:'annual_latest_reported',warnings:currency?[]:['REPORTING_CURRENCY_UNRESOLVED']};
}
export function financialRatios(company){
 const point=id=>company.metrics.find(m=>m.id===id)?.points.find(p=>p.end===company.periods[0]);
 const revenue=point('revenue'),income=point('netIncome'),cash=point('operatingCash');
 const same=(a,b)=>a&&b&&a.start===b.start&&a.end===b.end&&a.unit===b.unit&&Number.isFinite(a.value)&&Number.isFinite(b.value)&&b.value>0;
 return {netMargin:same(income,revenue)?income.value/revenue.value:null,cashMargin:same(cash,revenue)?cash.value/revenue.value:null};
}
