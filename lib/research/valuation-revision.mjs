import {valueThesis,portfolioImpact,VALUATION_VERSION} from './thesis-valuation.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
const economics=['growth','margin','taxRate','discountRate','terminalGrowth','salesToCapital','maintenanceRate','cashUsableRate','otherClaims'];
const factKeys=['revenue','ebit','cash','debt','shares'];

// Ex-post explanation of two stored calculations, not information available at
// the earlier date. Average the two input/assumption orderings (two-factor
// Shapley decomposition); neither ordering is asserted to be an economic cause.
export function valuationRevision(before,after){
 const out={version:'valuation-revision-v1',status:'unresolved',reason:null,
  before:before?{hash:before.hash,savedAt:before.savedAt}:null,
  after:after?{hash:after.hash,savedAt:after.savedAt}:null,
  operating:null,equity:null,perShare:null,priceGap:null,position:null,changedFacts:[],changedAssumptions:[],warnings:[],
  method:'average_of_two_factor_orderings',causalAttribution:false,predictiveClaim:false};
 const absent=reason=>({...out,reason});
 if(!before)return {...out,status:'no_prior',reason:'NO_PREVIOUS_CALCULATION'};
 if([before,after].some(r=>r?.kind!=='valuation'||r.valuation?.version!==VALUATION_VERSION))return absent('MODEL_OR_RECORD_INCOMPATIBLE');
 if(!before.financial?.cik||String(before.financial.cik)!==String(after.financial?.cik)
  ||before.financial.ticker!==after.financial.ticker)return absent('COMPANY_CHANGED');
 if(!finite(Date.parse(before.savedAt))||!finite(Date.parse(after.savedAt))||Date.parse(before.savedAt)>Date.parse(after.savedAt))return absent('INVALID_CHRONOLOGY');
 let values;
 try{
  values=[valueThesis(before.financial,before.assumptions,before.quote,before.savedAt),
   valueThesis(before.financial,after.assumptions,before.quote,before.savedAt),
   valueThesis(after.financial,before.assumptions,after.quote,after.savedAt),
   valueThesis(after.financial,after.assumptions,after.quote,after.savedAt)];
 }catch{return absent('INVALID_INPUTS')}
 for(const [record,value] of [[before,values[0]],[after,values[3]]]){
  if(!value.base||!record.valuation.base)return absent('OPERATING_BASE_UNRESOLVED');
  for(const key of ['operatingValue','equityValue','perShare']){
   const original=record.valuation.base[key],computed=value.base[key];
   if(original!==computed&&!close(original,computed))return absent('SAVED_OUTPUT_NOT_REPRODUCIBLE');
  }
 }
 function bridge(key){
  const v=values.map(r=>r.base?.[key]);if(!v.every(finite))return null;
  const inputs=((v[2]-v[0])+(v[3]-v[1]))/2;
  const assumptions=((v[1]-v[0])+(v[3]-v[2]))/2;
  const total=v[3]-v[0];
  if(![inputs,assumptions,total].every(finite)||!close(inputs+assumptions,total))return null;
  return {before:v[0],after:v[3],inputs,assumptions,total};
 }
 out.operating=bridge('operatingValue');if(!out.operating)return absent('CROSS_SCENARIO_UNRESOLVED');
 out.equity=bridge('equityValue');
 const sameShareBasis=before.financial.facts.shares?.value===after.financial.facts.shares?.value
  &&before.quote?.shares===after.quote?.shares;
 if(sameShareBasis)out.perShare=bridge('perShare');else out.warnings.push('SHARE_BASIS_CHANGED');
 if(out.perShare&&values[0].comparison&&values[3].comparison){
  const oldPrice=values[0].comparison.price,newPrice=values[3].comparison.price;
  out.priceGap={before:out.perShare.before-oldPrice,after:out.perShare.after-newPrice,
   valueChange:out.perShare.total,priceChange:newPrice-oldPrice,change:out.perShare.total-(newPrice-oldPrice)};
  const oldPosition=portfolioImpact(before.portfolio,values[0],before.quote,before.savedAt);
  const newPosition=portfolioImpact(after.portfolio,values[3],after.quote,after.savedAt);
  if(oldPosition.quantity>0&&oldPosition.quantity===newPosition.quantity&&finite(oldPosition.baseDeltaUsd)&&finite(newPosition.baseDeltaUsd)){
   const gapChangeUsd=oldPosition.quantity*out.priceGap.change;
   if(finite(gapChangeUsd))out.position={quantity:oldPosition.quantity,gapChangeUsd,realizedPnl:false,
    scope:'same_recorded_position_only_not_total_portfolio'};
  }
 }
 out.changedFacts=factKeys.filter(k=>JSON.stringify(before.financial.facts[k])!==JSON.stringify(after.financial.facts[k]));
 out.changedAssumptions=economics.filter(k=>before.assumptions[k]!==after.assumptions[k]);
 if(!out.equity)out.warnings.push('EQUITY_BRIDGE_UNRESOLVED');
 if(!out.priceGap)out.warnings.push('PRICE_GAP_UNRESOLVED');
 return {...out,status:'available'};
}
