import test from 'node:test';
import assert from 'node:assert/strict';
import {valueThesis,portfolioImpact,defaultAssumptions} from '../lib/research/thesis-valuation.mjs';
const at='2026-09-11T12:00:00.000Z';
const fact=(value,unit='USD')=>({value,unit,start:'2025-07-01',end:'2026-06-30',availableAt:'2026-07-29T20:00:00Z',accession:'abc',sourceHash:'a'.repeat(64),url:'https://www.sec.gov/example'});
export const financialFixture=()=>({ticker:'MSFT',cik:789019,asOf:at,retrievedAt:at,currency:'USD',identity:{singleClass:true,supportedBusiness:true},facts:{revenue:fact(100),ebit:fact(20),cash:fact(20),debt:fact(40),shares:fact(10,'shares')},warnings:[]});
export const assumptionFixture=()=>({...defaultAssumptions(financialFixture()),growth:0,margin:.2,taxRate:.25,discountRate:.1,terminalGrowth:0,maintenanceRate:0,cashUsableRate:1,otherClaims:0,bridgeReviewed:true,rationale:'Explicit zero incremental maintenance and other claims hypothesis.'});
const quote={ticker:'MSFT',price:8,currency:'USD',asOf:at,source:'fixture',shares:10,instrumentType:'EQUITY'};
test('FCFF discounts pre-financing cash and bridges cash/debt exactly once',()=>{
 const result=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 assert.ok(Math.abs(result.base.operatingValue-150)<1e-8);
 assert.ok(Math.abs(result.base.equityValue-130)<1e-8);
 assert.ok(Math.abs(result.base.perShare-13)<1e-8);
 assert.equal(result.base.years[0].fcff,15);
 assert.equal(result.performance,null);assert.equal(result.predictiveClaim,false);
});
test('price cannot improve the economic valuation or silently refresh financial evidence',()=>{
 const low=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 const high=valueThesis(financialFixture(),assumptionFixture(),{...quote,price:80},at);
 assert.deepEqual(low.base,high.base);assert.deepEqual(low.scenarios,high.scenarios);
 assert.ok(high.comparison.gap<0);assert.ok(low.comparison.gap>0);
});
test('unknown obligations preserve operating value but block per-share valuation',()=>{
 const a=assumptionFixture();a.otherClaims=null;
 const result=valueThesis(financialFixture(),a,quote,at);
 assert.equal(result.base.perShare,null);assert.equal(result.comparison,null);assert.ok(result.base.operatingValue>0);
 assert.ok(result.blockers.includes('BRIDGE_UNREVIEWED'));
});
test('missing facts, future evidence, periods, currency and business model cannot manufacture a target',()=>{
 for(const change of [f=>f.facts.ebit=null,f=>f.facts.ebit.availableAt='2027-01-01',f=>f.facts.ebit.end='2025-06-30',f=>f.facts.ebit.unit='EUR',f=>f.identity.supportedBusiness=false]){
  const f=financialFixture();change(f);const result=valueThesis(f,assumptionFixture(),quote,at);assert.equal(result.base,null);assert.equal(result.comparison,null);
 }
});
test('unresolved classes and materially different share counts block security comparison',()=>{
 const f=financialFixture();f.identity.singleClass=false;
 assert.equal(valueThesis(f,assumptionFixture(),quote,at).base.perShare,null);
 assert.equal(valueThesis(financialFixture(),assumptionFixture(),{...quote,shares:20},at).comparison,null);
 assert.equal(valueThesis(financialFixture(),assumptionFixture(),{...quote,currency:'EUR'},at).comparison,null);
 assert.equal(valueThesis(financialFixture(),assumptionFixture(),{...quote,asOf:'2026-08-01'},at).comparison,null);
});
test('growth consumes capital, including terminal growth, and contraction does not release it',()=>{
 const a=assumptionFixture();a.growth=.1;a.terminalGrowth=.02;
 const result=valueThesis(financialFixture(),a,quote,at);
 assert.ok(Math.abs(result.base.years[0].reinvestment-5)<1e-8);
 assert.ok(result.base.terminal.reinvestment>0);
 a.growth=-.1;assert.equal(valueThesis(financialFixture(),a,quote,at).base.years[0].growthInvestment,0);
 assert.throws(()=>valueThesis(financialFixture(),{...a,terminalGrowth:.1},quote,at),/INVALID_ASSUMPTIONS/);
});
test('sensitivity is finite and no-loss scenarios never imply infinite asymmetry',()=>{
 const r=valueThesis(financialFixture(),assumptionFixture(),{...quote,price:.01},at);
 assert.equal(r.comparison.asymmetry,null);assert.equal(r.sensitivity.length,9);
 assert.ok(r.sensitivity.every(x=>Number.isFinite(x.operatingValue)));
});
const holding=(ticker,quantity,price)=>({ticker,quantity,currency:'USD',asset_type:'stock',current_price_usd:price,market_value_usd:quantity*price,updated_at:at});
test('portfolio impact uses owned recorded units, does not trade or normalize away unpriced positions',()=>{
 const valuation=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 const p={status:'available',holdings:[holding('MSFT',2,8),holding('AAPL',4,21)]};
 const before=structuredClone(p);const result=portfolioImpact(p,valuation,quote,at);
 assert.equal(result.quantity,2);assert.equal(result.recordedWeight,.16);assert.ok(Math.abs(result.baseDeltaUsd-10)<1e-8);assert.deepEqual(p,before);
 p.holdings[1].market_value_usd=null;
 assert.equal(portfolioImpact(p,valuation,quote,at).recordedWeight,null);
 assert.equal(portfolioImpact(p,valuation,quote,at).coverage.priced,1);
});
test('stale quantities, foreign currency, short positions and unavailable portfolios do not imply safe exposure',()=>{
 const v=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 for(const patch of [{updated_at:'2026-01-01'},{currency:'EUR'},{quantity:-2}]){
  const r=portfolioImpact({status:'available',holdings:[{...holding('MSFT',2,8),...patch}]},v,quote,at);
  assert.equal(r.baseDeltaUsd,null);
 }
 assert.equal(portfolioImpact({status:'unavailable'},v,quote,at).status,'unavailable');
 assert.equal(portfolioImpact({status:'available',holdings:[]},v,quote,at).status,'empty');
});
