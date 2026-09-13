import test from 'node:test';
import assert from 'node:assert/strict';
import {reinvestmentDiagnostic} from '../lib/research/reinvestment-diagnostic.mjs';
import {defaultAssumptions,valueThesis} from '../lib/research/thesis-valuation.mjs';
const at='2026-09-13T00:00:00Z';
const fact=(value,concept,unit='USD')=>({value,unit,concepts:[concept],start:'2025-07-01',end:'2026-06-30',accession:'annual',availableAt:'2026-07-29T20:00:00Z',url:'https://www.sec.gov/Archives/annual.htm',sourceHash:'a'.repeat(64),filingHash:'b'.repeat(64)});
function inputs(){
 const f={ticker:'ONE',cik:1,asOf:at,currency:'USD',identity:{singleClass:true,supportedBusiness:true},warnings:[],
  facts:{revenue:fact(100,'Revenues'),ebit:fact(20,'OperatingIncomeLoss'),cash:fact(20,'CashAndCashEquivalentsAtCarryingValue'),debt:fact(40,'DebtCurrent'),shares:fact(10,'WeightedAverageNumberOfDilutedSharesOutstanding','shares')}};
 f.history=[{end:'2026-06-30',facts:{revenue:structuredClone(f.facts.revenue),capex:fact(15,'PaymentsToAcquirePropertyPlantAndEquipment'),depreciation:fact(5,'Depreciation')}}];
 const a={...defaultAssumptions(f),growth:.1,terminalGrowth:.02,otherClaims:2,bridgeReviewed:true,rationale:'Explicit user hypothesis.'};
 const q={ticker:'ONE',price:8,asOf:at,currency:'USD',instrumentType:'EQUITY',shares:10};
 return {f,a,q};
}
test('a matched no-growth comparison isolates the investment burden without changing the saved growth thesis',()=>{
 const {f,a,q}=inputs(),before=JSON.stringify({f,a,q}),r=reinvestmentDiagnostic(f,a,q,at);
 assert.equal(r.status,'available');assert.equal(r.observed.difference,10);assert.equal(r.observed.revenueRatio,.1);
 // Constant NOPAT 15: zero growth and zero net reinvestment yields 15/.1=150.
 // Repeating a burden of 10 leaves 5/.1=50. Identical equity bridge: +20-40-2.
 assert.ok(Math.abs(r.control.operatingValue-150)<1e-9);assert.ok(Math.abs(r.repeated.operatingValue-50)<1e-9);
 assert.ok(Math.abs(r.control.perShare-12.8)<1e-9);assert.ok(Math.abs(r.repeated.perShare-2.8)<1e-9);
 assert.ok(Math.abs(r.delta.perShare+10)<1e-9);
 assert.deepEqual(r.proposal,{growth:0,terminalGrowth:0,maintenanceRate:.1});
 assert.equal(r.normalizedMaintenanceIdentified,false);assert.equal(r.predictiveClaim,false);
 assert.equal(JSON.stringify({f,a,q}),before);
});
test('the diagnostic cannot bypass an unreviewed equity bridge or turn price into business value',()=>{
 const {f,a,q}=inputs(),r=reinvestmentDiagnostic(f,{...a,otherClaims:null,bridgeReviewed:false},q,at);
 assert.ok(r.repeated.operatingValue>0);assert.equal(r.repeated.perShare,null);assert.equal(r.delta.perShare,null);
 const low=reinvestmentDiagnostic(f,a,q,at),high=reinvestmentDiagnostic(f,a,{...q,price:800},at);
 assert.deepEqual(low.repeated,high.repeated);assert.deepEqual(low.observed,high.observed);
});
test('missing, conflicted, future, mixed-period or mixed-scope data cannot produce a maintenance proxy',()=>{
 const mutations=[
  f=>delete f.history[0].facts.depreciation,
  f=>f.history.push(structuredClone(f.history[0])),
  f=>f.history[0].facts.depreciation.availableAt='2027-01-01T00:00:00Z',
  f=>f.history[0].facts.depreciation.start='2026-01-01',
  f=>f.history[0].facts.depreciation.accession='different',
  f=>f.history[0].facts.depreciation.filingHash='c'.repeat(64),
  f=>f.history[0].facts.depreciation.sourceHash='c'.repeat(64),
  f=>f.history[0].facts.depreciation.concepts=['DepreciationDepletionAndAmortization'],
  f=>f.history[0].facts.capex.unit='EUR',
  f=>f.history[0].facts.capex.value=-1,
  f=>f.history[0].facts.revenue.value=101,
 ];
 for(const change of mutations){const {f,a,q}=inputs();change(f);const r=reinvestmentDiagnostic(f,a,q,at);
  assert.equal(r.status,'unresolved');assert.equal(r.observed,null);assert.equal(r.proposal,null);}
});
test('a negative observed difference is preserved, not forecast as a perpetual cash release',()=>{
 const {f,a,q}=inputs();f.history[0].facts.capex.value=3;
 const r=reinvestmentDiagnostic(f,a,q,at);
 assert.equal(r.observed.difference,-2);assert.equal(r.status,'nonpositive_difference');
 assert.equal(r.repeated,null);assert.equal(r.proposal,null);
});
test('a burden beyond the existing model domain is shown but not clipped into an admissible scenario',()=>{
 const {f,a,q}=inputs();f.history[0].facts.capex.value=60;
 const r=reinvestmentDiagnostic(f,a,q,at);
 assert.equal(r.observed.revenueRatio,.55);assert.equal(r.status,'outside_model_domain');assert.equal(r.proposal,null);
});
test('applying all three proposed assumptions reproduces the displayed stress and avoids double counting growth investment',()=>{
 const {f,a,q}=inputs(),r=reinvestmentDiagnostic(f,a,q,at);
 const result=valueThesis(f,{...a,...r.proposal},q,at);
 assert.equal(result.base.operatingValue,r.repeated.operatingValue);assert.equal(result.base.perShare,r.repeated.perShare);
 assert.ok(result.base.years.every(y=>y.growthInvestment===0));assert.equal(result.base.terminal.reinvestment,10);
});
