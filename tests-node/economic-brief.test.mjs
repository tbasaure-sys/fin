import test from 'node:test';import assert from 'node:assert/strict';
import {briefInput} from './fixtures/economic-brief-input.mjs';
async function implementation(){let mod;try{mod=await import('../lib/research/economic-brief.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}assert.ok(mod,'economic brief must be implemented');return mod}

test('operating earnings reconcile into revenue at prior margin and the margin change at current revenue',async()=>{
 const {economicBrief,operatingSensitivity}=await implementation(),input=briefInput(),before=JSON.stringify(input);
 const o=economicBrief(input).operating;assert.ok(o,'operating earnings must be connected to the brief');
 assert.equal(o.status,'available');assert.equal(o.prior,10);assert.equal(o.current,24);
 assert.equal(o.priorMargin,.1);assert.equal(o.currentMargin,.2);
 assert.equal(o.revenueEffect,2);assert.equal(o.marginEffect,12);assert.equal(o.change,14);
 assert.equal(o.reconciliationGap,0);assert.equal(o.economicCauseVerified,false);assert.equal(o.normalized,false);
 assert.equal(o.evidence.ebit.current.accession,'test-filing');
 assert.equal(operatingSensitivity(o,0).operatingIncome,12);
 assert.equal(operatingSensitivity(o,.5).operatingIncome,18);
 assert.equal(operatingSensitivity(o,1).operatingIncome,24);
 assert.equal(operatingSensitivity(o,0).changeVsObserved,-12);
 assert.equal(operatingSensitivity(o,0).forecast,false);
 assert.equal(operatingSensitivity(o,-.1),null);assert.equal(operatingSensitivity(o,1.1),null);
 assert.equal(operatingSensitivity(o,NaN),null);assert.equal(JSON.stringify(input),before);
});

test('operating bridge preserves loss reversals and declining margins without calling them durable improvements',async()=>{
 const {economicBrief,operatingSensitivity}=await implementation();
 for(const [prior,current,expectedRevenue,expectedMargin,expectedZero] of [[-10,6,-2,18,-12],[20,12,4,-12,24],[10,12,2,0,12]]){
  const input=briefInput(),pair=input.reading.interim.metrics.ebit;
  pair.prior.value=pair.prior.terms[0].fact.value=prior;pair.current.value=pair.current.terms[0].fact.value=current;
  const o=economicBrief(input).operating;assert.equal(o?.status,'available');
  assert.equal(o.revenueEffect,expectedRevenue);assert.ok(Math.abs(o.marginEffect-expectedMargin)<1e-10);
  assert.ok(Math.abs(o.revenueEffect+o.marginEffect-(current-prior))<1e-10);
  assert.ok(Math.abs(operatingSensitivity(o,0).operatingIncome-expectedZero)<1e-10);
 }
});

test('operating bridge does not substitute stale annual earnings or mix periods, tags, cutoffs or currencies',async()=>{
 const {economicBrief}=await implementation();
 for(const mutate of [x=>delete x.reading.interim.metrics.ebit,
  x=>x.reading.interim.metrics.ebit.current.terms[0].fact.start='2026-04-01',
  x=>x.reading.interim.metrics.ebit.prior.terms[0].fact.concepts=['different'],
  x=>x.reading.interim.metrics.ebit.current.terms[0].fact.accession='other',
  x=>x.reading.interim.metrics.ebit.current.terms[0].fact.availableAt='2027-01-01',
  x=>x.reading.interim.metrics.ebit.current.unit='EUR',
  x=>{x.reading.interim.metrics.revenue.prior.value=0;x.reading.interim.metrics.revenue.prior.terms[0].fact.value=0}]){
   const input=briefInput();mutate(input);assert.equal(economicBrief(input).operating?.status,'unresolved');
  }
 const input=briefInput();delete input.dossier.revenueBreakdown;
 assert.equal(economicBrief(input).operating?.status,'available','segment coverage must not gate consolidated earnings');
});
test('a growth bridge preserves offsetting businesses and measures dependence without calling it recurring revenue',async()=>{
 const {economicBrief,growthSensitivity}=await implementation(),input=briefInput(),before=JSON.stringify(input);
 const brief=economicBrief(input),g=brief.growth;
 assert.equal(g.status,'available');assert.equal(g.growth,0.2);assert.equal(g.primary.label,'Hardware');assert.equal(g.primary.change,30);
 assert.equal(g.primary.shareOfNetChange,1.5,'offsets can make contribution exceed all net growth');assert.equal(g.rows[1].change,-10);
 assert.equal(g.economicCauseVerified,false);assert.equal(brief.predictiveClaim,false);
 const probe=growthSensitivity(g,0);assert.equal(probe.revenue,90);assert.equal(probe.growth,-0.1);assert.equal(probe.changeVsObserved,-30);
 assert.equal(growthSensitivity(g,0.5).revenue,105);assert.equal(growthSensitivity(g,1).revenue,120);
 assert.equal(growthSensitivity(g,-1),null);assert.equal(growthSensitivity(g,NaN),null);
 assert.equal(JSON.stringify(input),before);assert.equal(g.source.url,'https://www.sec.gov/Archives/test.htm');
});
test('cash and allocation use the same cumulative period and never double count activity totals',async()=>{
 const {economicBrief}=await implementation();const b=economicBrief(briefInput());
 assert.equal(b.cash.status,'available');assert.equal(b.cash.basis,'cumulative');assert.equal(b.cash.current,25);assert.equal(b.cash.prior,20);
 assert.equal(b.cash.operatingEffect,10);assert.equal(b.cash.investmentEffect,-5);assert.equal(b.cash.change,5);
 assert.equal(b.capital.selectedResidual,4);assert.equal(b.capital.otherInvesting,-2);assert.equal(b.capital.otherFinancing,-1);
 assert.equal(b.capital.unclassified,0);assert.equal(b.capital.cashChange,1);assert.equal(b.capital.fundingAttribution,null);
 assert.equal(b.growthCashComparable,true);assert.equal(b.cash.start,'2026-01-01');
});
test('missing capex or incompatible filings cannot manufacture cash or substitute old annual data',async()=>{
 const {economicBrief}=await implementation();
 for(const mutate of [x=>x.reading.interim.metrics.capex.current.value=null,x=>x.reading.interim.metrics.capex.current.terms[0].fact.accession='other',x=>x.reading.interim.metrics.cfo.prior.terms[0].fact.end='2025-03-31']){
  const x=briefInput();mutate(x);const b=economicBrief(x);assert.equal(b.cash.status,'unresolved');assert.equal(b.growth.status,'available');assert.equal(b.growthCashComparable,false);
 }
 const x=briefInput();delete x.reading.interim.metrics.dividends;
 assert.equal(economicBrief(x).capital.status,'unresolved');assert.equal(economicBrief(x).cash.status,'available');
});
test('alternative partitions are separate, and a zero-growth base never receives a fake percentage',async()=>{
 const {economicBrief,growthSensitivity}=await implementation();const x=briefInput(),p=x.dossier.revenueBreakdown.partitions[0];
 x.dossier.revenueBreakdown.partitions.push({...structuredClone(p),axis:'srt:StatementGeographicalAxis'});
 let b=economicBrief(x);assert.equal(b.growth.rows.length,2);assert.equal(b.growth.current,120);
 p.currentTotal.value=100;p.rows[0].current.value=60;
 b=economicBrief(x);assert.equal(b.growth.change,0);assert.equal(b.growth.primary.shareOfNetChange,null);assert.equal(growthSensitivity(b.growth,0).growth,-0.1);
});
test('future sources, mismatched issuers, invalid tables and different reporting periods remain distinct gaps',async()=>{
 const {economicBrief}=await implementation();
 for(const mutate of [x=>x.dossier.sources[0].acceptedAt='2027-01-01',x=>x.dossier.sources[0].cik='2',x=>x.dossier.revenueBreakdown.partitions[0].rows[0].current.value=900,x=>x.dossier.revenueBreakdown.partitions[0].currentTotal.start='2026-04-01']){
  const x=briefInput();mutate(x);assert.equal(economicBrief(x).growth.status,'unresolved');
 }
 const x=briefInput();x.reading.ticker='OTHER';const b=economicBrief(x);assert.equal(b.cash.status,'unresolved');assert.equal(b.growthCashComparable,false);
});
test('annual context needs complete fiscal years and cannot label a half year as annual',async()=>{
 const {economicBrief}=await implementation(),x=briefInput(),metrics=x.reading.interim.metrics;
 delete x.reading.interim;delete x.dossier.revenueBreakdown;
 x.dossier.asOf=x.reading.asOf='2027-02-02T00:00:00Z';Object.assign(x.dossier.sources[0],{form:'10-K',periodEnd:'2026-12-31',acceptedAt:'2027-02-01T00:00:00Z'});
 x.reading.periods=[2025,2026].map((year,i)=>({end:`${year}-12-31`,values:Object.fromEntries(Object.entries(metrics).map(([key,pair])=>{
  const raw={...pair[i?'current':'prior'].terms[0].fact,start:`${year}-01-01`,end:`${year}-12-31`,availableAt:'2027-02-01T00:00:00Z'};
  const id=`${year}:${key}`;x.reading.evidence[id]=raw;return [key,{value:raw.value,unit:'USD',status:'known_value',evidenceKeys:[id]}];
 }))}));
 let b=economicBrief(x);assert.equal(b.cash.basis,'annual');assert.equal(b.cash.change,5);
 assert.equal(b.operating.basis,'annual');assert.equal(b.operating.marginEffect,12);
 for(const f of Object.values(x.reading.evidence))f.start=f.start.replace('01-01','07-01');
 b=economicBrief(x);assert.equal(b.cash.status,'unresolved');assert.equal(b.operating.status,'unresolved');
});
