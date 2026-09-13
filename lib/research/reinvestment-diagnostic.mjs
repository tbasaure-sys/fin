import {valueThesis,VALUATION_VERSION} from './thesis-valuation.mjs';

// A source-to-assumption experiment, not an estimate of maintenance capex.
// Use physical depreciation only; total D&A can include unrelated intangibles.
export function reinvestmentDiagnostic(financial,assumptions,quote,at){
 const result={version:'reinvestment-diagnostic-v1',modelVersion:VALUATION_VERSION,status:'unresolved',
  observed:null,control:null,repeated:null,delta:null,proposal:null,
  normalizedMaintenanceIdentified:false,predictiveClaim:false};
 const base=financial?.facts?.revenue,cutoff=Date.parse(financial?.asOf);
 const rows=financial?.history?.filter(p=>p.end===base?.end)||[];
 if(rows.length!==1||!base||!Number.isFinite(cutoff))return result;
 const {revenue,capex,depreciation}=rows[0].facts||{};
 const fields=['unit','start','end','accession','availableAt','sourceHash','filingHash','url'];
 const valid=f=>f&&Number.isFinite(f.value)&&f.value>=0&&f.unit==='USD'
  &&/^[a-f0-9]{64}$/.test(f.sourceHash||'')&&/^[a-f0-9]{64}$/.test(f.filingHash||'')
  &&/^https:\/\//.test(f.url||'')&&Date.parse(f.availableAt)<=cutoff&&Date.parse(f.end)<=Date.parse(f.availableAt)
  &&fields.every(k=>f[k]===base[k]);
 const duration=(Date.parse(base.end)-Date.parse(base.start))/86400000;
 if(!(duration>=330&&duration<=380)||!valid(revenue)||!valid(capex)||!valid(depreciation)
  ||!(revenue.value>0)||revenue.value!==base.value
  ||capex.concepts?.length!==1||capex.concepts[0]!=='PaymentsToAcquirePropertyPlantAndEquipment'
  ||depreciation.concepts?.length!==1||depreciation.concepts[0]!=='Depreciation')return result;
 const difference=capex.value-depreciation.value,revenueRatio=difference/revenue.value;
 result.observed={start:base.start,end:base.end,availableAt:base.availableAt,difference,revenueRatio,
  revenue:structuredClone(revenue),capex:structuredClone(capex),depreciation:structuredClone(depreciation)};
 if(difference<=0)return {...result,status:'nonpositive_difference'};
 // This existing model accepts at most 30% of revenue as net maintenance.
 // Never clip the observed burden to make a source-based scenario admissible.
 if(revenueRatio>.3)return {...result,status:'outside_model_domain'};
 const common={...assumptions,growth:0,terminalGrowth:0};
 const control=valueThesis(financial,{...common,maintenanceRate:0},quote,at);
 const repeated=valueThesis(financial,{...common,maintenanceRate:revenueRatio},quote,at);
 if(!control.base||!repeated.base)return {...result,status:'model_unavailable'};
 const summary=v=>({operatingValue:v.base.operatingValue,equityValue:v.base.equityValue,perShare:v.base.perShare});
 result.control=summary(control);result.repeated=summary(repeated);
 result.delta={operatingValue:result.repeated.operatingValue-result.control.operatingValue,
  perShare:result.repeated.perShare===null||result.control.perShare===null?null:result.repeated.perShare-result.control.perShare};
 result.proposal={growth:0,terminalGrowth:0,maintenanceRate:revenueRatio};
 return {...result,status:'available'};
}
