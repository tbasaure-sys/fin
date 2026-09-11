import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThesisFinancials,parseThesisQuote,readOwnedPortfolio} from '../lib/server/thesis-financials.js';
const source={accession:'0001',acceptedAt:'2026-07-29T20:00:00Z',url:'https://www.sec.gov/example',sha256:'f'.repeat(64)};
const dossier={cik:1,ticker:'ONE',asOf:'2026-09-11T12:00:00Z',sources:[source]};
const row=value=>({val:value,start:'2025-07-01',end:'2026-06-30',accn:'0001',form:'10-K',filed:'2026-07-29'});
const concept=value=>({units:{USD:[row(value)]}});
function raw(){return {cik:1,facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:concept(100),OperatingIncomeLoss:concept(20),CashAndCashEquivalentsAtCarryingValue:concept(20),DebtCurrent:concept(5),LongTermDebtNoncurrent:concept(35),WeightedAverageNumberOfDilutedSharesOutstanding:{units:{shares:[row(10)]}}}}};}
const meta={cik:1,tickers:['ONE'],sic:'7372',entityType:'operating'};
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
