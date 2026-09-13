import test from 'node:test';
import assert from 'node:assert/strict';
import {valueThesis} from '../lib/research/thesis-valuation.mjs';
import {revisionFixture} from './fixtures/valuation-revision-input.mjs';
async function compare(){const m=await import('../lib/research/valuation-revision.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e});assert.ok(m?.valuationRevision,'revision attribution must be implemented');return m.valuationRevision}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('a price-only revision changes the valuation gap but not the business value',async()=>{
 const fn=await compare(),r=fn(revisionFixture(),revisionFixture({price:12}));
 assert.equal(r.status,'available');near(r.operating.total,0);near(r.operating.inputs,0);near(r.operating.assumptions,0);
 near(r.priceGap.priceChange,4);near(r.priceGap.valueChange,0);near(r.priceGap.change,-4);
 assert.equal(r.predictiveClaim,false);assert.equal(r.causalAttribution,false);
});

test('a two-factor revision shares the interaction equally and reconciles exactly',async()=>{
 const fn=await compare(),before=revisionFixture(),after=revisionFixture({revenue:120,maintenance:.01,price:9});
 const original=JSON.stringify([before,after]),r=fn(before,after);
 // Operating values: F0A0=150, F1A0=180, F0A1=140, F1A1=168.
 near(r.operating.before,150);near(r.operating.after,168);near(r.operating.inputs,29);near(r.operating.assumptions,-11);near(r.operating.total,18);
 near(r.equity.inputs,29);near(r.perShare.total,1.8);near(r.priceGap.change,.8);
 assert.deepEqual(r.changedAssumptions,['maintenanceRate']);
 assert.ok(r.changedFacts.includes('revenue'));assert.equal(JSON.stringify([before,after]),original);
});

test('rationale changes alone do not masquerade as economic revisions',async()=>{
 const fn=await compare(),a=revisionFixture(),b=revisionFixture();b.assumptions.rationale='A longer explanation';
 const r=fn(a,b);near(r.operating.total,0);assert.deepEqual(r.changedAssumptions,[]);
});

test('changed models, companies or unreproducible saved outputs are not attributed to new evidence',async()=>{
 const fn=await compare();
 for(const mutate of [r=>r.valuation.version='legacy',r=>r.financial.cik=2,r=>r.valuation.base.operatingValue+=10,r=>r.savedAt='2020-01-01']){
  const b=revisionFixture();mutate(b);const r=fn(revisionFixture(),b);assert.equal(r.status,'unresolved');assert.equal(r.operating,null);
 }
 assert.equal(fn(null,revisionFixture()).status,'no_prior');
});

test('share-basis changes preserve operating attribution but block per-share gap comparisons',async()=>{
 const fn=await compare(),r=fn(revisionFixture(),revisionFixture({shares:20,price:4}));
 near(r.operating.total,0);assert.equal(r.perShare,null);assert.equal(r.priceGap,null);
 assert.ok(r.warnings.includes('SHARE_BASIS_CHANGED'));
});

test('unreviewed capital bridges do not turn operating changes into equity claims',async()=>{
 const fn=await compare(),a=revisionFixture(),b=revisionFixture({revenue:120});
 for(const r of [a,b]){r.assumptions.bridgeReviewed=false;r.assumptions.otherClaims=null;r.valuation=valueThesis(r.financial,r.assumptions,r.quote,r.savedAt)}
 const out=fn(a,b);near(out.operating.total,30);assert.equal(out.equity,null);assert.equal(out.priceGap,null);
});

test('the change in model gap translates into a fixed recorded position without calling it earned PnL',async()=>{
 const fn=await compare(),a=revisionFixture(),b=revisionFixture({revenue:120,maintenance:.01,price:9});
 for(const r of [a,b])r.portfolio={status:'available',holdings:[{ticker:'TEST',quantity:2,asset_type:'stock',currency:'USD',market_value_usd:16,updated_at:r.savedAt}]};
 const r=fn(a,b);near(r.position?.gapChangeUsd,1.6);assert.equal(r.position.quantity,2);assert.equal(r.position.realizedPnl,false);
 b.portfolio.holdings[0].quantity=3;assert.equal(fn(a,b).position,null);
 b.portfolio.holdings[0].quantity=2;b.portfolio.holdings[0].updated_at='2020-01-01';assert.equal(fn(a,b).position,null);
});

test('limited-liability floors are applied in each counterfactual, not after attributing raw equity',async()=>{
 const fn=await compare(),a=revisionFixture(),b=revisionFixture({revenue:200,maintenance:.02});
 for(const r of [a,b]){r.financial.facts.debt.value=200;r.valuation=valueThesis(r.financial,r.assumptions,r.quote,r.savedAt)}
 const r=fn(a,b);near(r.perShare.before,0);near(r.perShare.after,8);
 near(r.perShare.inputs,10);near(r.perShare.assumptions,-2);near(r.perShare.total,8);
});

test('equal endpoint quantities cannot certify that the same holding was maintained between snapshots',async()=>{
 const fn=await compare(),a=revisionFixture(),b=revisionFixture({revenue:120,price:9});
 for(const [i,r] of [a,b].entries())r.portfolio={status:'available',holdings:[{ticker:'TEST',quantity:2,asset_type:'stock',currency:'USD',market_value_usd:16,updated_at:r.savedAt,account_id:`account-${i}`} ]};
 const r=fn(a,b);
 assert.equal(r.position.quantity,2);near(r.position.gapChangeUsd,4);
 assert.equal(r.position.holdingContinuityVerified,false,'matching endpoints are not transaction-history evidence');
 assert.equal(r.position.realizedPnl,false);
});
