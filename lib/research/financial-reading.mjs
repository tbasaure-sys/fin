// Reproducible documentary arithmetic. No language model, forecast or inferred valuation.
import {cashChangeBridge,interimCashChangeBridge} from './cash-change-bridge.mjs';
export const FINANCIAL_READING_VERSION='financial-reading-v1';
const DAY=86400000;
const METRICS=['revenue','ebit','netIncome','cfo','capex','sbc','buybacks','dividends','shares','da','receivablesChange','inventoryChange','payablesChange'];
const NONNEGATIVE=new Set(['revenue','capex','sbc','buybacks','dividends','shares']);
const unknown=(unit,reason='MISSING_FACT')=>({value:null,unit,status:'unknown',reason,evidenceKeys:[]});
const number=x=>typeof x==='number'&&Number.isFinite(x);
function valid(f,unit,end,asOf){
 const days=(Date.parse(f?.end)-Date.parse(f?.start))/DAY;
 return f&&number(f.value)&&f.unit===unit&&f.end===end&&days>=330&&days<=380
  &&Number.isFinite(Date.parse(f.availableAt))&&Date.parse(f.end)<=Date.parse(f.availableAt)&&Date.parse(f.availableAt)<=Date.parse(asOf)
  &&/^[a-f0-9]{64}$/.test(f.sourceHash||'')&&/^[a-f0-9]{64}$/.test(f.filingHash||'')
  &&typeof f.accession==='string'&&f.accession.length>0&&Array.isArray(f.concepts)&&f.concepts.length>0
  &&/^https:\/\/www\.sec\.gov\//.test(f.url||'');
}
export function financialReading(financial){
 const evidence={},periods=[];
 for(const period of [...(financial.history||[])].sort((a,b)=>a.end.localeCompare(b.end)).slice(-3)){
  const values={};
  for(const key of METRICS){
   const fact=period.facts?.[key],unit=key==='shares'?'shares':'USD',id=`${period.end}:${key}`;
   if(financial.currency!=='USD'||!valid(fact,unit,period.end,financial.asOf)||(NONNEGATIVE.has(key)&&fact.value<0))values[key]=unknown(unit);
   else {evidence[id]=structuredClone(fact);values[key]={value:fact.value,unit,status:'known_value',evidenceKeys:[id]};}
  }
  function derive(id,keys,unit,formula){
   const cells=keys.map(key=>values[key]);
   if(cells.some(c=>c.value===null)){values[id]=unknown(unit);return;}
   const input=cells.flatMap(c=>c.evidenceKeys).map(id=>evidence[id]);
   if(!input.every(f=>f.start===input[0].start&&f.end===input[0].end&&f.accession===input[0].accession)){
    values[id]=unknown(unit,'INCOMPATIBLE_PERIOD_OR_FILING');return;
   }
   const value=formula(...cells.map(c=>c.value));
   values[id]=number(value)?{value,unit,status:'known_value',evidenceKeys:cells.flatMap(c=>c.evidenceKeys)}:unknown(unit,'INVALID_DENOMINATOR');
  }
  derive('cashAfterCapex',['cfo','capex'],'USD',(cfo,capex)=>cfo-capex);
  derive('operatingMargin',['ebit','revenue'],'ratio',(ebit,revenue)=>revenue>0?ebit/revenue:null);
  derive('distributions',['buybacks','dividends'],'USD',(buybacks,dividends)=>buybacks+dividends);
  periods.push({end:period.end,values});
 }
 const latest=periods.at(-1),previous=periods.at(-2),comparisons={};
 for(const key of [...METRICS,'cashAfterCapex','operatingMargin','distributions']){
  const a=previous?.values[key],b=latest?.values[key];
  let compatible=false;
  if(a?.value!==null&&b?.value!==null&&a&&b){
   const span=(Date.parse(latest.end)-Date.parse(previous.end))/DAY;
   const before=a.evidenceKeys.map(k=>evidence[k]),after=b.evidenceKeys.map(k=>evidence[k]);
   compatible=span>=330&&span<=380&&before.length===after.length&&before.every((f,i)=>
    f.accession===after[i].accession&&f.unit===after[i].unit&&f.concepts.join()===after[i].concepts.join()
    &&(Date.parse(after[i].start)-Date.parse(f.end))/DAY>=0&&(Date.parse(after[i].start)-Date.parse(f.end))/DAY<=8);
  }
  comparisons[key]={from:previous?.end||null,to:latest?.end||null,status:compatible?'comparable':'unresolved',
   change:compatible?b.value-a.value:null,percentChange:compatible&&a.value>0&&b.unit!=='ratio'?(b.value-a.value)/a.value:null};
 }
 const signals=[];
 if(financial.identity?.supportedBusiness===true&&latest){
  const ref=(period,metric)=>({end:period.end,metric});
  if(comparisons.cfo.change>0&&comparisons.cashAfterCapex.change<0)signals.push({id:'CASH_REINVESTMENT_DIVERGENCE',
   evidence:[ref(previous,'cfo'),ref(latest,'cfo'),ref(previous,'cashAfterCapex'),ref(latest,'cashAfterCapex')]});
  const distribution=latest.values.distributions,residual=latest.values.cashAfterCapex;
  const inputs=[...distribution.evidenceKeys,...residual.evidenceKeys].map(k=>evidence[k]);
  if(distribution.value>0&&residual.value!==null&&inputs.every(f=>f.start===inputs[0].start&&f.end===inputs[0].end&&f.accession===inputs[0].accession)
   &&distribution.value>residual.value)signals.push({id:'DISTRIBUTIONS_EXCEED_RESIDUAL',gap:distribution.value-residual.value,
    evidence:[ref(latest,'distributions'),ref(latest,'cashAfterCapex')]});
  if(comparisons.shares.change>0&&latest.values.buybacks.value>0){
   const shares=evidence[`${latest.end}:shares`],buybacks=evidence[`${latest.end}:buybacks`];
   if(shares.start===buybacks.start&&shares.accession===buybacks.accession)signals.push({id:'DILUTED_SHARES_UP_WITH_BUYBACKS',
    evidence:[ref(previous,'shares'),ref(latest,'shares'),ref(latest,'buybacks')]});
  }
 }
 return {version:FINANCIAL_READING_VERSION,ticker:financial.ticker,asOf:financial.asOf,retrievedAt:financial.retrievedAt||null,
  status:periods.some(p=>Object.values(p.values).some(v=>v.value!==null))?'available':'unresolved',periods,comparisons,signals,evidence,
  cashBridge:cashChangeBridge({periods,comparisons,evidence,supportedBusiness:financial.identity?.supportedBusiness===true}),
  interim:financial.interim?{...structuredClone(financial.interim),cashBridge:interimCashChangeBridge(financial.interim,financial.identity?.supportedBusiness===true)}:null,
  scope:'comparative_annual_figures_in_pinned_filings_not_PIT_history',cashDefinition:'operating_cash_flow_minus_cash_ppe_acquisitions_not_normalized_fcff',
  valuation:null,mispricing:null,performance:null,predictiveClaim:false};
}
