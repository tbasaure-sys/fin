import test from 'node:test';
import assert from 'node:assert/strict';
async function build(financial){
 const mod=await import('../lib/research/financial-reading.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});
 assert.equal(typeof mod.financialReading,'function','the deterministic financial reading must exist');
 return mod.financialReading(financial);
}
function fixture(){
 const annual=(year,values)=>({end:`${year}-12-31`,facts:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{
  value,unit:key==='shares'?'shares':'USD',start:`${year}-01-01`,end:`${year}-12-31`,availableAt:'2026-02-20T00:00:00Z',
  accession:'approved',concepts:[key],url:'https://www.sec.gov/Archives/edgar/data/1/report.htm',sourceHash:'a'.repeat(64),filingHash:'b'.repeat(64),
 }]))});
 return {ticker:'TEST',cik:1,asOf:'2026-09-13T00:00:00Z',currency:'USD',identity:{supportedBusiness:true},history:[
  annual(2024,{revenue:100,ebit:20,netIncome:16,cfo:30,capex:10,sbc:3,buybacks:10,dividends:5,shares:10}),
  annual(2025,{revenue:120,ebit:24,netIncome:18,cfo:35,capex:25,sbc:5,buybacks:12,dividends:6,shares:11}),
 ]};
}
test('cash bridge and diagnostic flags are computed, not composed by a model',async()=>{
 const r=await build(fixture());
 assert.equal(r.periods[0].values.cashAfterCapex.value,20);assert.equal(r.periods[1].values.cashAfterCapex.value,10);
 assert.equal(r.periods[1].values.operatingMargin.value,.2);
 assert.equal(r.comparisons.cashAfterCapex.change,-10);assert.equal(r.comparisons.cashAfterCapex.percentChange,-.5);
 assert.deepEqual(r.signals.map(s=>s.id),['CASH_REINVESTMENT_DIVERGENCE','DISTRIBUTIONS_EXCEED_RESIDUAL','DILUTED_SHARES_UP_WITH_BUYBACKS']);
 assert.equal(r.signals[1].gap,8);assert.equal(r.valuation,null);assert.equal(r.predictiveClaim,false);
 assert.deepEqual(r.periods[1].values.cashAfterCapex.evidenceKeys,['2025-12-31:cfo','2025-12-31:capex']);
 assert.equal(r.evidence['2025-12-31:cfo'].availableAt,'2026-02-20T00:00:00Z');
});
test('negative residuals remain negative and missing capex never becomes zero',async()=>{
 const f=fixture();f.history[1].facts.capex.value=40;
 assert.equal((await build(f)).periods[1].values.cashAfterCapex.value,-5);
 f.history[1].facts.capex=null;
 const r=await build(f);assert.equal(r.periods[1].values.cashAfterCapex.value,null);
 assert.ok(!r.signals.some(s=>s.id==='CASH_REINVESTMENT_DIVERGENCE'));
});
test('different periods and incompatible units block arithmetic, not the raw rows',async()=>{
 const f=fixture();f.history[1].facts.capex.start='2025-04-01';
 let r=await build(f);assert.equal(r.periods[1].values.cfo.value,35);assert.equal(r.periods[1].values.cashAfterCapex.value,null);
 f.history[1].facts.capex={...f.history[1].facts.cfo,value:25,unit:'EUR'};
 r=await build(f);assert.equal(r.periods[1].values.capex.value,null);assert.equal(r.periods[1].values.cashAfterCapex.value,null);
});
test('future evidence and quarterly financial facts cannot masquerade as annual figures',async()=>{
 const f=fixture();f.history[1].facts.revenue.availableAt='2027-01-01';f.history[1].facts.cfo.start='2025-10-01';
 const r=await build(f);assert.equal(r.periods[1].values.revenue.value,null);assert.equal(r.periods[1].values.cfo.value,null);
});
test('comparisons require adjacent fiscal years and a consistent filed basis',async()=>{
 const f=fixture();f.history[0].facts.shares.accession='older-unreconciled-basis';
 let r=await build(f);assert.equal(r.comparisons.shares.percentChange,null);assert.ok(!r.signals.some(s=>s.id==='DILUTED_SHARES_UP_WITH_BUYBACKS'));
 f.history[0].end='2023-12-31';
 r=await build(f);assert.equal(r.comparisons.revenue.percentChange,null);
});
test('negative or zero comparison bases do not manufacture growth percentages',async()=>{
 const f=fixture();f.history[0].facts.cfo.value=0;f.history[0].facts.capex.value=10;
 const r=await build(f);assert.equal(r.comparisons.cfo.change,35);assert.equal(r.comparisons.cfo.percentChange,null);
 assert.equal(r.comparisons.cashAfterCapex.change,20);assert.equal(r.comparisons.cashAfterCapex.percentChange,null);
});

function withBridgeFacts(){
 const f=fixture();
 for(const [i,values] of [{da:4,receivablesChange:2,inventoryChange:4,payablesChange:1},{da:5,receivablesChange:5,inventoryChange:2,payablesChange:4}].entries())
  for(const [key,value] of Object.entries(values))f.history[i].facts[key]={...f.history[i].facts.cfo,value,concepts:[key]};
 return f;
}

test('cash change decomposes signed accounting contributions and retains the unexplained difference',async()=>{
 const r=await build(withBridgeFacts()),b=r.cashBridge;
 assert.equal(b?.status,'available');
 assert.equal(b.operatingCashChange,5);
 assert.deepEqual(b.components.map(c=>[c.id,c.effect]),[['netIncome',2],['da',1],['sbc',2],['receivablesChange',-3],['inventoryChange',2],['payablesChange',3]]);
 assert.equal(b.unexplained.value,-2);
 assert.equal(b.capex.effect,-15);
 assert.equal(b.cashAfterCapexChange,-10);
 assert.equal(b.explanationComplete,false);
 assert.deepEqual(b.components.find(c=>c.id==='receivablesChange').evidenceKeys,['2024-12-31:receivablesChange','2025-12-31:receivablesChange']);
});

test('missing adjustments stay missing and move into the unclassified difference, never zero',async()=>{
 const f=withBridgeFacts();delete f.history[1].facts.da;
 const b=(await build(f)).cashBridge;
 assert.ok(b?.missingComponents.some(c=>c.id==='da'));
 assert.ok(!b.components.some(c=>c.id==='da'));
 assert.equal(b.unexplained.value,-1);
 f.history[1].facts.capex=null;
 const next=(await build(f)).cashBridge;
 assert.equal(next.operatingCashChange,5);assert.equal(next.capex,null);assert.equal(next.cashAfterCapexChange,null);
});

test('a negative reported inventory change keeps its sign and is not clamped to zero',async()=>{
 const f=withBridgeFacts();f.history[1].facts.inventoryChange.value=-2;
 const b=(await build(f)).cashBridge;
 assert.equal(b?.components.find(c=>c.id==='inventoryChange')?.effect,6);
 assert.equal(b.unexplained.value,-6);
});

test('individually comparable adjustments cannot cross the cash statement filing basis',async()=>{
 const f=withBridgeFacts();for(const p of f.history)p.facts.sbc.accession='different-presentation';
 const b=(await build(f)).cashBridge;
 assert.ok(b?.missingComponents.some(c=>c.id==='sbc'&&c.reason==='INCOMPATIBLE_CASHFLOW_BASIS'));
 assert.ok(!b.components.some(c=>c.id==='sbc'));
});

test('missing cash endpoints, changed concepts and unsupported businesses cannot fabricate a bridge',async()=>{
 const f=withBridgeFacts();f.history[1].facts.cfo=null;
 assert.equal((await build(f)).cashBridge?.status,'unresolved');
 const g=withBridgeFacts();g.identity.supportedBusiness=false;
 assert.equal((await build(g)).cashBridge?.status,'not_applicable');
 const h=withBridgeFacts();h.history[1].facts.receivablesChange.concepts=['OtherReceivables'];
 assert.ok((await build(h)).cashBridge?.missingComponents.some(c=>c.id==='receivablesChange'));
});
