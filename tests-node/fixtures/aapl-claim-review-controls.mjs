import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const original=require('./aapl-recorded-review-v114.json');
export const dossier=require('./aapl-recorded-date-repair.json').dossier;
// Agent-adjudicated, already inspected development cases. No independent quality claim.
const bad=new Set(original.checks.mustNotPublishUnchanged.map(c=>c.id));
const good=new Set(original.checks.supportedControls.map(c=>c.id));
const support={
 'thesis:0':['single or limited sources','advanced semiconductors, storage (NAND) and memory (DRAM)','may materially adversely impact'],
 'thesis:1':['can adversely impact consumer confidence and spending','demand for the Company’s products and services'],
 'thesis:2':['minority market share','availability and quality of applications','lower customer demand'],
};
export const cases=[...original.draft.sections.flatMap(s=>s.findings.map((f,i)=>{
 const id=`${s.id}:${i}`;
 return {id,text:f.text,chunkIds:f.evidence.map(e=>e.chunkId),expected:bad.has(id)?false:good.has(id)?true:null,requiredSupport:support[id]||[]};
})),
 {id:'product-margin-faithful',chunkIds:['D4:490'],expected:true,requiredSupport:['third quarter and first nine months of 2026','different mix of products and tariff refunds','partially offset by higher costs, including memory'],
  text:'Apple atribuye la mejora del margen bruto de productos durante el tercer trimestre y los primeros nueve meses a una mezcla diferente de productos y reembolsos arancelarios, parcialmente compensados por mayores costos, incluidos los de memoria.'},
 {id:'deferred-revenue-faithful',chunkIds:['D4:T231'],expected:true,requiredSupport:['disaggregated net sales','portion of total net sales that was previously deferred'],
  text:'La nota desglosa ventas netas por productos y servicios e identifica la porción que estaba incluida en ingresos diferidos al inicio del período.'},
 {id:'repurchases-faithful',chunkIds:['D4:350'],expected:true,requiredSupport:['During the nine months ended June 27, 2026','share repurchase programs do not obligate'],
  text:'Apple declara recompras realizadas durante los nueve meses y aclara que sus programas no la obligan a adquirir una cantidad mínima de acciones.'},
 {id:'debt-basis-faithful',chunkIds:['D4:350'],expected:true,requiredSupport:['outstanding fixed-rate notes with varying maturities','aggregate carrying amount','fair value of the Company’s Notes'],
  text:'Las notas de tasa fija tienen vencimientos variados; la compañía reporta por separado su valor contable agregado y su valor razonable.'},
];
