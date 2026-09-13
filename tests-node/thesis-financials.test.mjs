import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThesisFinancials,parseThesisQuote,readOwnedPortfolio,createFinancialLoader} from '../lib/server/thesis-financials.js';
import {valueThesis,defaultAssumptions} from '../lib/research/thesis-valuation.mjs';
const source={accession:'0001',acceptedAt:'2026-07-29T20:00:00Z',url:'https://www.sec.gov/example',sha256:'f'.repeat(64)};
const dossier={cik:1,ticker:'ONE',asOf:'2026-09-11T12:00:00Z',sources:[source]};
const row=value=>({val:value,start:'2025-07-01',end:'2026-06-30',accn:'0001',form:'10-K',filed:'2026-07-29'});
const concept=value=>({units:{USD:[row(value)]}});
function raw(){return {cik:1,facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:concept(100),OperatingIncomeLoss:concept(20),CashAndCashEquivalentsAtCarryingValue:concept(20),DebtCurrent:concept(5),LongTermDebtNoncurrent:concept(35),WeightedAverageNumberOfDilutedSharesOutstanding:{units:{shares:[row(10)]}}}}};}
const meta={cik:1,tickers:['ONE'],sic:'7372',entityType:'operating'};

test('a partial amendment remains traceable but cannot silently blend into the valuation base',()=>{
 const d={...dossier,sources:[{...source,form:'10-K'},{...source,accession:'0002',form:'10-K/A',acceptedAt:'2026-08-02T20:00:00Z',sha256:'b'.repeat(64)}]};
 const r=raw();r.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push({...row(120),accn:'0002',form:'10-K/A',filed:'2026-08-02'});
 const f=normalizeThesisFinancials(r,meta,d,'a'.repeat(64),d.asOf);
 assert.equal(f.facts.revenue.value,120);assert.equal(f.facts.revenue.accession,'0002');
 assert.equal(f.facts.ebit.value,20);assert.equal(f.facts.ebit.accession,'0001');
 const result=valueThesis(f,{...defaultAssumptions(f),otherClaims:0,bridgeReviewed:true,rationale:'Explicit fixture assumptions'},null,d.asOf);
 assert.equal(result.base,null);assert.ok(result.blockers.includes('OPERATING_FACTS_UNRESOLVED'));
});
test('only approved accessions contribute; future restatements and wrong units cannot leak in',()=>{
 const r=raw();r.facts['us-gaap'].OperatingIncomeLoss.units.USD.push({...row(999),accn:'future',filed:'2027-01-01'});
 const f=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf);
 assert.equal(f.facts.ebit.value,20);assert.equal(f.facts.debt.value,40);assert.equal(f.facts.ebit.availableAt,source.acceptedAt);
 r.facts['us-gaap'].OperatingIncomeLoss.units={EUR:[row(20)]};assert.equal(normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).facts.ebit,null);
});
test('partial debt, conflicting values and unapproved identity remain unresolved',()=>{
 const r=raw();delete r.facts['us-gaap'].DebtCurrent;
 assert.equal(normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).facts.debt,null);
 r.facts['us-gaap'].OperatingIncomeLoss.units.USD.push(row(21));
 assert.equal(normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).facts.ebit,null);
 assert.throws(()=>normalizeThesisFinancials({...r,cik:2},meta,dossier,'a'.repeat(64),dossier.asOf),/IDENTITY_MISMATCH/);
 assert.equal(normalizeThesisFinancials(raw(),{...meta,tickers:['ONE','TWO']},dossier,'a'.repeat(64),dossier.asOf).identity.singleClass,false);
});

test('annual reading retains comparative cash and capital data with source clocks, not quarterly substitutes',()=>{
 const r=raw(),g=r.facts['us-gaap'];
 const prior=v=>({...row(v),start:'2024-07-01',end:'2025-06-30'});
 g.RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(prior(90));
 g.NetCashProvidedByUsedInOperatingActivities={units:{USD:[row(30),prior(25),{...row(99),start:'2026-04-01',form:'10-Q'}]}};
 g.PaymentsToAcquirePropertyPlantAndEquipment={units:{USD:[row(12),prior(8)]}};
 g.ShareBasedCompensation=concept(3);
 g.PaymentsForRepurchaseOfCommonStock=concept(10);
 g.PaymentsOfDividendsCommonStock=concept(5);
 const f=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf);
 assert.equal(f.history?.length,2);
 assert.equal(f.history[0].end,'2025-06-30');assert.equal(f.history[1].facts.cfo.value,30);
 assert.equal(f.history[1].facts.capex.value,12);assert.equal(f.history[1].facts.sbc.value,3);
 assert.equal(f.history[1].facts.buybacks.availableAt,source.acceptedAt);
 assert.equal(f.history[0].facts.cfo.availableAt,source.acceptedAt);
});

test('missing cash capex is not substituted with capital assets, depreciation or zero',()=>{
 const r=raw();r.facts['us-gaap'].PropertyPlantAndEquipmentNet=concept(999);
 const f=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf);
 assert.equal(f.history?.[0]?.facts.capex,null);
});

test('cash bridge inputs use reported flow changes, not differences of balance sheet stocks',()=>{
 const r=raw(),g=r.facts['us-gaap'];
 g.DepreciationDepletionAndAmortization=concept(4);
 g.IncreaseDecreaseInAccountsReceivable=concept(5);
 g.IncreaseDecreaseInInventories=concept(-2);
 g.IncreaseDecreaseInAccountsPayable=concept(3);
 g.AccountsReceivableNetCurrent=concept(900);
 const facts=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).history[0].facts;
 assert.equal(facts.da?.value,4);assert.equal(facts.receivablesChange?.value,5);
 assert.equal(facts.inventoryChange?.value,-2);assert.equal(facts.payablesChange?.value,3);
 delete g.IncreaseDecreaseInAccountsReceivable;
 assert.equal(normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).history[0].facts.receivablesChange,null);
});

test('physical depreciation is separate from total depreciation and amortization for reinvestment research',()=>{
 const r=raw(),g=r.facts['us-gaap'];
 g.Depreciation=concept(4);g.DepreciationDepletionAndAmortization=concept(7);
 let facts=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).history[0].facts;
 assert.equal(facts.depreciation?.value,4);assert.deepEqual(facts.depreciation.concepts,['Depreciation']);assert.equal(facts.da.value,7);
 delete g.Depreciation;
 facts=normalizeThesisFinancials(r,meta,dossier,'a'.repeat(64),dossier.asOf).history[0].facts;
 assert.equal(facts.depreciation,null);assert.equal(facts.da.value,7);
});

test('document-only financial reads never call price or keyed market providers',async()=>{
 const urls=[];
 const load=createFinancialLoader({includeQuote:false,fetcher:async url=>{
  urls.push(url);return Response.json(url.includes('companyfacts')?raw():meta);
 }});
 const result=await load(dossier);
 assert.equal(result.quote,null);assert.equal(urls.length,2);
 assert.ok(urls.every(url=>new URL(url).hostname==='data.sec.gov'));
});
test('quote identity, timestamp and currency are not fabricated from the request',()=>{
 const chart={chart:{result:[{meta:{symbol:'ONE',regularMarketPrice:8,regularMarketTime:1789128000,currency:'USD',instrumentType:'EQUITY',sharesOutstanding:10}}]}};
 assert.equal(parseThesisQuote(chart,'ONE').price,8);
 assert.throws(()=>parseThesisQuote(chart,'OTHER'),/QUOTE_IDENTITY/);
 delete chart.chart.result[0].meta.regularMarketTime;
 assert.equal(parseThesisQuote(chart,'ONE').asOf,null);
 delete chart.chart.result[0].meta.currency;assert.equal(parseThesisQuote(chart,'ONE').currency,null);
});
test('portfolio reader emits only SELECT, joins ownership, and never invokes history or legacy fallback',async()=>{
 const rows=[{ticker:'ONE',quantity:'2',currency:'USD',asset_type:'stock',market_value_usd:'16',updated_at:dossier.asOf}];
 const db={query:async(sql,args)=>{assert.match(sql,/^SELECT/);assert.match(sql,/owner_user_id = \$2/);assert.deepEqual(args,['private-w','alice']);return rows}};
 assert.deepEqual((await readOwnedPortfolio('alice','private-w',{getSql:()=>db})).holdings,rows);
 await assert.rejects(()=>readOwnedPortfolio('','private-w',{getSql:()=>db}),/AUTH_REQUIRED/);
});
