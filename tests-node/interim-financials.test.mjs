import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThesisFinancials} from '../lib/server/thesis-financials.js';
import {financialReading} from '../lib/research/financial-reading.mjs';

const concepts={revenue:'RevenueFromContractWithCustomerExcludingAssessedTax',ebit:'OperatingIncomeLoss',cfo:'NetCashProvidedByUsedInOperatingActivities',capex:'PaymentsToAcquirePropertyPlantAndEquipment'};
function fixture(){
 const source=(accession,form,periodEnd,acceptedAt)=>({accession,form,periodEnd,acceptedAt,url:`https://www.sec.gov/Archives/${accession}.htm`,sha256:'b'.repeat(64)});
 const dossier={cik:1,ticker:'TEST',asOf:'2026-09-13T00:00:00Z',sources:[
  source('annual','10-K','2025-12-31','2026-02-20T12:00:00Z'),source('interim','10-Q','2026-06-30','2026-07-25T12:00:00Z')]};
 const raw={cik:1,facts:{'us-gaap':{}}};
 for(const [key,values] of Object.entries({revenue:[100,60,70],ebit:[20,10,17],cfo:[30,18,22],capex:[10,4,8]})){
  raw.facts['us-gaap'][concepts[key]]={units:{USD:[
   {val:values[0],accn:'annual',form:'10-K',start:'2025-01-01',end:'2025-12-31'},
   {val:values[1],accn:'interim',form:'10-Q',start:'2025-01-01',end:'2025-06-30'},
   {val:values[2],accn:'interim',form:'10-Q',start:'2026-01-01',end:'2026-06-30'},
   // Isolated quarter with the same end must never replace the cumulative flow.
   {val:999,accn:'interim',form:'10-Q',start:'2026-04-01',end:'2026-06-30'},
  ]}};
 }
 return {raw,dossier};
}
function run({raw,dossier}){
 const financial=normalizeThesisFinancials(raw,{cik:1,tickers:['TEST'],sic:'7372'},dossier,'a'.repeat(64),dossier.asOf);
 return financialReading(financial);
}

function capitalFixture(){
 const f=fixture();
 for(const [concept,prior,current] of [
  ['PaymentsForRepurchaseOfCommonStock',5,7],['PaymentsOfDividends',2,3],
  ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',4,1],
 ])f.raw.facts['us-gaap'][concept]={units:{USD:[
  {val:prior,accn:'interim',form:'10-Q',start:'2025-01-01',end:'2025-06-30'},
  {val:current,accn:'interim',form:'10-Q',start:'2026-01-01',end:'2026-06-30'},
 ]}};
 return f;
}

function activityFixture(){
 const f=capitalFixture();
 for(const [concept,prior,current] of [['NetCashProvidedByUsedInInvestingActivities',-5,-10],['NetCashProvidedByUsedInFinancingActivities',-9,-11]]){
  f.raw.facts['us-gaap'][concept]={units:{USD:[{val:prior,accn:'interim',form:'10-Q',start:'2025-01-01',end:'2025-06-30'},
   {val:current,accn:'interim',form:'10-Q',start:'2026-01-01',end:'2026-06-30'}]}};
 }
 return f;
}

test('other cash movements are partitioned without counting capex and distributions twice',()=>{
 const v=run(activityFixture()).interim.metrics;
 assert.equal(v.otherInvesting?.current.value,-2,'net investing -10 plus previously deducted PPE 8');
 assert.equal(v.otherFinancing.current.value,-1,'net financing -11 plus previously deducted buybacks 7 and dividends 3');
 assert.equal(v.unclassifiedCashChange.current.value,0,'reported 1 minus operating 22, investing -10 and financing -11');
 assert.equal(v.otherCashMovements.current.value,-3);
 assert.deepEqual(v.otherFinancing.current.terms.map(t=>[t.fact.metric,t.coefficient,t.fact.value]),[['cff',1,-11],['buybacks',1,7],['dividends',1,3]]);
 assert.equal(v.otherFinancing.current.fundingAttribution,null);
});

test('a nonzero cash reconciliation difference stays visible and is not assigned to FX',()=>{
 const f=activityFixture();f.raw.facts['us-gaap'].NetCashProvidedByUsedInFinancingActivities.units.USD[1].val=-10;
 const v=run(f).interim.metrics;
 assert.equal(v.unclassifiedCashChange?.current.value,-1);
 assert.equal(v.unclassifiedCashChange.current.classification,'unclassified_difference_not_economic_cause');
});

test('missing or conflicted activity totals never become zero or borrow another filing',()=>{
 const f=activityFixture(),g=f.raw.facts['us-gaap'];delete g.NetCashProvidedByUsedInInvestingActivities;
 let v=run(f).interim.metrics;
 assert.equal(v.otherInvesting?.current.value,null);assert.equal(v.unclassifiedCashChange.current.value,null);
 assert.equal(v.otherFinancing.current.value,-1);assert.equal(v.otherCashMovements.current.value,-3);
 g.NetCashProvidedByUsedInFinancingActivities.units.USD.push({...g.NetCashProvidedByUsedInFinancingActivities.units.USD[1],val:-12});
 v=run(f).interim.metrics;assert.equal(v.otherFinancing.current.value,null);
});

test('current capital uses reconcile to the reported cash change without assigning a funding source',()=>{
 const v=run(capitalFixture()).interim;
 assert.equal(v.metrics.cashAfterDistributions?.current.value,4,'22 CFO - 8 PPE - 7 repurchases - 3 dividends');
 assert.equal(v.metrics.cashAfterDistributions.prior.value,7);
 assert.equal(v.metrics.cashAfterDistributions.change.value,-3);
 assert.equal(v.metrics.otherCashMovements.current.value,-3,'reported cash increase 1 minus selected residual 4');
 assert.equal(v.metrics.cashChange.current.value,1);
 assert.deepEqual(v.metrics.cashAfterDistributions.current.terms.map(t=>[t.coefficient,t.fact.metric,t.fact.value]),[[1,'cfo',22],[-1,'capex',8],[-1,'buybacks',7],[-1,'dividends',3]]);
 assert.equal(v.metrics.otherCashMovements.current.classification,'unclassified_difference_not_economic_cause');
 assert.equal(v.metrics.cashAfterDistributions.current.fundingAttribution,null);
});

test('missing capital uses are unknown, not zero, and common-only dividends do not impersonate total dividends',()=>{
 const f=capitalFixture(),g=f.raw.facts['us-gaap'];
 g.PaymentsOfDividendsCommonStock=g.PaymentsOfDividends;delete g.PaymentsOfDividends;
 const v=run(f).interim;
 assert.equal(v.metrics.dividends?.current.value,null);
 assert.equal(v.metrics.cashAfterDistributions.current.value,null);
 assert.equal(v.metrics.otherCashMovements.current.value,null);
 assert.equal(v.metrics.cashAfterCapex.current.value,14);
});

test('capital shortfalls retain their sign while negative payment inputs are rejected',()=>{
 const f=capitalFixture(),g=f.raw.facts['us-gaap'];g.PaymentsForRepurchaseOfCommonStock.units.USD[1].val=20;
 let v=run(f).interim;assert.equal(v.metrics.cashAfterDistributions?.current.value,-9);
 assert.equal(v.metrics.otherCashMovements.current.value,10);
 g.PaymentsForRepurchaseOfCommonStock.units.USD[1].val=-20;
 v=run(f).interim;assert.equal(v.metrics.buybacks.current.value,null);
 assert.equal(v.metrics.cashAfterDistributions.current.value,null);
});

test('a comparative payment from a different end date cannot complete the capital bridge',()=>{
 const f=capitalFixture();f.raw.facts['us-gaap'].PaymentsOfDividends.units.USD[0].end='2025-06-23';
 const v=run(f).interim;assert.equal(v.metrics.cashAfterDistributions.current.value,4);
 assert.equal(v.metrics.cashAfterDistributions.prior.value,null);assert.equal(v.metrics.cashAfterDistributions.change.value,null);
});

test('an explicitly reported zero payout is usable but a missing cash-change anchor stays unknown',()=>{
 const f=capitalFixture(),g=f.raw.facts['us-gaap'];g.PaymentsOfDividends.units.USD[1].val=0;
 delete g.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect;
 const v=run(f).interim;assert.equal(v.metrics.cashAfterDistributions.current.value,7);
 assert.equal(v.metrics.cashChange.current.value,null);assert.equal(v.metrics.otherCashMovements.current.value,null);
});
test('latest cumulative results and trailing year use annual plus YTD minus prior YTD, not annualization',()=>{
 const r=run(fixture()),v=r.interim;
 assert.equal(v?.status,'available');
 assert.equal(v.end,'2026-06-30');assert.equal(v.start,'2026-01-01');
 assert.equal(v.metrics.cfo.current.value,22);assert.equal(v.metrics.cfo.prior.value,18);
 assert.equal(v.metrics.cfo.change.value,4);assert.equal(v.metrics.cfo.trailing.value,34);
 assert.equal(v.metrics.revenue.trailing.value,110);
 assert.equal(v.metrics.cashAfterCapex.current.value,14);assert.equal(v.metrics.cashAfterCapex.prior.value,14);
 assert.equal(v.metrics.cashAfterCapex.change.value,0);assert.equal(v.metrics.cashAfterCapex.trailing.value,20);
 assert.deepEqual(v.metrics.cfo.trailing.terms.map(t=>[t.coefficient,t.fact.value]),[[1,30],[1,22],[-1,18]]);
 assert.equal(v.metrics.cfo.trailing.start,'2025-07-01');
 assert.equal(v.metrics.cfo.trailing.basis,'combined_filings_not_restatement_reconciled');
 assert.equal(r.periods.at(-1).values.cfo.value,30,'annual history is not overwritten');
 assert.equal(r.valuation,null);
});
test('missing prior YTD preserves the current figure but blocks change and trailing year',()=>{
 const f=fixture();f.raw.facts['us-gaap'][concepts.cfo].units.USD=f.raw.facts['us-gaap'][concepts.cfo].units.USD.filter(r=>r.end!=='2025-06-30');
 const v=run(f).interim;
 assert.equal(v?.metrics.cfo.current.value,22);
 assert.equal(v.metrics.cfo.prior.value,null);assert.equal(v.metrics.cfo.change.value,null);
 assert.equal(v.metrics.cfo.trailing.value,null);assert.equal(v.metrics.cashAfterCapex.trailing.value,null);
});
test('a conflict in the newest source cannot be rescued by another concept or older quarter',()=>{
 const f=fixture(),g=f.raw.facts['us-gaap'];
 g[concepts.cfo].units.USD.push({...g[concepts.cfo].units.USD[2],val:23});
 const v=run(f).interim;
 assert.equal(v?.metrics.cfo.current.value,null);assert.equal(v.metrics.cfo.current.reason,'CONFLICTED_FACT');
 assert.equal(v.metrics.cfo.trailing.value,null);
});
test('a newer incomplete amendment remains visible and does not silently fall back',()=>{
 const f=fixture();f.dossier.sources.push({...f.dossier.sources[1],accession:'amended',form:'10-Q/A',acceptedAt:'2026-08-01T00:00:00Z'});
 const v=run(f).interim;
 assert.equal(v?.status,'unresolved');assert.equal(v.accession,'amended');
 assert.equal(v.metrics.cfo.current.value,null);
});
test('period end before the cutoff does not admit a filing accepted after the cutoff',()=>{
 const f=fixture();f.dossier.sources[1].acceptedAt='2026-10-01T00:00:00Z';
 assert.equal(run(f).interim?.status,'no_new_interim');
});
test('changed accounting tags permit current observation but never fabricate a comparable trailing year',()=>{
 const f=fixture(),g=f.raw.facts['us-gaap'];
 g.Revenues={units:{USD:[g[concepts.revenue].units.USD[0]]}};
 g[concepts.revenue].units.USD=g[concepts.revenue].units.USD.filter(r=>r.form!=='10-K');
 const v=run(f).interim;
 assert.equal(v?.metrics.revenue.current.value,70);
 assert.equal(v.metrics.revenue.trailing.value,null);
 assert.equal(v.metrics.revenue.trailing.reason,'INCOMPATIBLE_ANNUAL_BASIS');
});
test('negative cash, zero bases and missing cash capex retain their meaning',()=>{
 const f=fixture(),g=f.raw.facts['us-gaap'];
 g[concepts.cfo].units.USD[1].val=0;g[concepts.cfo].units.USD[2].val=-2;
 const v=run(f).interim;
 assert.equal(v?.metrics.cfo.change.value,-2);assert.equal(v.metrics.cfo.change.percentChange,null);
 assert.equal(v.metrics.cashAfterCapex.current.value,-10);
 delete g[concepts.capex];
 assert.equal(run(f).interim.metrics.cashAfterCapex.current.value,null);
});
test('mismatched comparative durations and non-USD facts are not added to the annual figures',()=>{
 const f=fixture(),g=f.raw.facts['us-gaap'];g[concepts.cfo].units.USD[1].end='2025-03-31';
 assert.equal(run(f).interim?.metrics.cfo.trailing.value,null);
 g[concepts.capex].units={EUR:g[concepts.capex].units.USD};
 assert.equal(run(f).interim.metrics.capex.current.value,null);
});
test('an impossible negative cash investment reconstruction remains unresolved',()=>{
 const f=fixture(),rows=f.raw.facts['us-gaap'][concepts.capex].units.USD;
 rows[0].val=1;rows[1].val=20;
 const v=run(f).interim;
 assert.equal(v.metrics.capex.current.value,8);
 assert.equal(v.metrics.capex.trailing.value,null);
 assert.equal(v.metrics.capex.trailing.reason,'INCOMPATIBLE_ANNUAL_BASIS');
 assert.equal(v.metrics.cashAfterCapex.trailing.value,null);
});
