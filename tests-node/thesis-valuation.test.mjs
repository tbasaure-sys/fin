import test from 'node:test';
import assert from 'node:assert/strict';
import {valueThesis,portfolioImpact,defaultAssumptions} from '../lib/research/thesis-valuation.mjs';
const at='2026-09-11T12:00:00.000Z';
const fact=(value,unit='USD')=>({value,unit,start:'2025-07-01',end:'2026-06-30',availableAt:'2026-07-29T20:00:00Z',accession:'abc',sourceHash:'a'.repeat(64),url:'https://www.sec.gov/example'});
export const financialFixture=()=>({ticker:'MSFT',cik:789019,asOf:at,retrievedAt:at,currency:'USD',identity:{singleClass:true,supportedBusiness:true},facts:{revenue:fact(100),ebit:fact(20),cash:fact(20),debt:fact(40),shares:fact(10,'shares')},warnings:[]});
export const assumptionFixture=()=>({...defaultAssumptions(financialFixture()),growth:0,margin:.2,taxRate:.25,discountRate:.1,terminalGrowth:0,maintenanceRate:0,cashUsableRate:1,otherClaims:0,bridgeReviewed:true,rationale:'Explicit zero incremental maintenance and other claims hypothesis.'});
const quote={ticker:'MSFT',price:8,currency:'USD',asOf:at,source:'fixture',shares:10,instrumentType:'EQUITY'};

test('price conditions expose exactly what erases the gap, including a negative equity endpoint',()=>{
 const r=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 assert.ok(r.priceConditions,'price conditions must be calculable separately from economic predictions');
 const maintenance=r.priceConditions.items.find(x=>x.parameter==='maintenanceRate');
 assert.equal(maintenance.status,'within_domain');assert.ok(Math.abs(maintenance.breakEven-.05)<1e-10);
 assert.equal(maintenance.adverseDirection,'increase');assert.ok(Math.abs(maintenance.adverseStep.perShareDelta+1)<1e-10);
 const margin=r.priceConditions.items.find(x=>x.parameter==='margin');
 // Independent discounted margin-ramp coefficient: 62.547... USD/share per 1.0 margin.
 assert.ok(Math.abs(margin.breakEven-.12006136945613774)<1e-10);
 assert.ok(Math.abs(margin.adverseStep.perShareDelta+.6254798169523937)<1e-10);
 assert.equal(r.priceConditions.claim,'conditional_model_boundary_not_market_forecast');
});
test('price conditions remain blocked when claims or the quote are unresolved',()=>{
 for(const [a,q] of [[{...assumptionFixture(),otherClaims:null},quote],[assumptionFixture(),{...quote,asOf:'2020-01-01'}]]){
  const r=valueThesis(financialFixture(),a,q,at);assert.equal(r.priceConditions,null);
 }
});
test('an unreachable break-even is explicit, not clamped to the model boundary',()=>{
 const r=valueThesis(financialFixture(),assumptionFixture(),{...quote,price:8000},at);
 assert.ok(r.priceConditions);for(const item of r.priceConditions.items){assert.equal(item.status,'outside_domain');assert.equal(item.breakEven,null)}
});
test('a price change moves the required conditions without improving business value',()=>{
 const lo=valueThesis(financialFixture(),assumptionFixture(),quote,at),hi=valueThesis(financialFixture(),assumptionFixture(),{...quote,price:12},at);
 assert.deepEqual(lo.base,hi.base);
 assert.ok(hi.priceConditions.items[0].breakEven>lo.priceConditions.items[0].breakEven);
 assert.ok(hi.priceConditions.items[1].breakEven<lo.priceConditions.items[1].breakEven);
});
test('recorded shares translate condition sensitivity into dollars, without a portfolio forecast',()=>{
 const v=valueThesis(financialFixture(),assumptionFixture(),quote,at);
 const p=portfolioImpact({status:'available',holdings:[{ticker:'MSFT',quantity:2,currency:'USD',asset_type:'stock',market_value_usd:16,updated_at:at}]},v,quote,at);
 assert.ok(p.conditionDeltas);assert.ok(Math.abs(p.conditionDeltas.find(x=>x.parameter==='maintenanceRate').deltaUsd+2)<1e-10);
});
test('a break-even exactly at zero maintenance remains a value, not an unknown',()=>{
 const r=valueThesis(financialFixture(),assumptionFixture(),{...quote,price:13},at);
 const item=r.priceConditions.items.find(x=>x.parameter==='maintenanceRate');
 assert.equal(item.status,'within_domain');assert.ok(Math.abs(item.breakEven)<1e-12);
 const a={...assumptionFixture(),margin:.01,maintenanceRate:.3};
 assert.ok(valueThesis(financialFixture(),a,quote,at).priceConditions.items.every(x=>x.adverseStep===null));
});
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

test('unreconciled operating statements cannot generate an implied margin or a portfolio valuation',()=>{
 const f=financialFixture();f.facts.revenue.accession='amended-report';
 const result=valueThesis(f,assumptionFixture(),quote,at);
 assert.equal(result.base,null,'matching periods do not reconcile an amendment with the original statement');
 assert.equal(result.comparison,null);assert.equal(result.priceConditions,null);
 assert.ok(result.blockers.includes('OPERATING_FACTS_UNRESOLVED'));
 const p=portfolioImpact({status:'available',holdings:[holding('MSFT',2,8)]},result,quote,at);
 assert.equal(p.baseDeltaUsd,null);assert.deepEqual(p.scenarioDeltas,[]);
});

test('cash and debt from different statement versions preserve operating value but block the equity bridge',()=>{
 const f=financialFixture();f.facts.cash.accession='amended-report';
 const result=valueThesis(f,assumptionFixture(),quote,at);
 assert.ok(Math.abs(result.base.operatingValue-150)<1e-8);
 assert.equal(result.base.equityValue,null);assert.equal(result.base.perShare,null);
 assert.equal(result.comparison,null);assert.equal(result.priceConditions,null);
 assert.ok(result.blockers.includes('CAPITAL_FACTS_UNRESOLVED'));
});

test('a coherent newer balance sheet may accompany the annual operating base',()=>{
 const f=financialFixture();
 for(const key of ['cash','debt'])Object.assign(f.facts[key],{start:null,end:'2026-08-31',availableAt:'2026-09-01T20:00:00Z',accession:'interim-report'});
 const result=valueThesis(f,assumptionFixture(),quote,at);
 assert.equal(result.status,'conditional');assert.deepEqual(result.blockers,[]);
 assert.ok(Math.abs(result.base.perShare-13)<1e-8,'do not demand identical filings across different economic periods');
});
test('unresolved classes and materially different share counts block security comparison',()=>{
 const f=financialFixture();f.identity.singleClass=false;
 assert.equal(valueThesis(f,assumptionFixture(),quote,at).base.perShare,null);
 assert.equal(valueThesis(financialFixture(),assumptionFixture(),{...quote,shares:20},at).comparison,null);
 assert.equal(valueThesis(financialFixture(),assumptionFixture(),{...quote,shares:20},at).base.perShare,null);
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
