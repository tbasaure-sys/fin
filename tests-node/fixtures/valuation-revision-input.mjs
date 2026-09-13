import {valueThesis,defaultAssumptions} from '../../lib/research/thesis-valuation.mjs';
const at='2026-09-13T12:00:00Z';
const fact=(value,unit='USD')=>({value,unit,start:'2025-07-01',end:'2026-06-30',availableAt:'2026-07-29T20:00:00Z',accession:'fixture',sourceHash:'a'.repeat(64),filingHash:'b'.repeat(64),url:'https://www.sec.gov/Archives/fixture'});
export function revisionFixture({revenue=100,maintenance=0,price=8,shares=10}={}){
 const financial={ticker:'TEST',cik:1,asOf:at,currency:'USD',identity:{singleClass:true,supportedBusiness:true},facts:{revenue:fact(revenue),ebit:fact(revenue*.2),cash:fact(20),debt:fact(40),shares:fact(shares,'shares')},warnings:[]};
 const assumptions={...defaultAssumptions(financial),margin:.2,taxRate:.25,maintenanceRate:maintenance,otherClaims:0,bridgeReviewed:true,rationale:'Test assumptions, not a real company.'};
 const quote={ticker:'TEST',currency:'USD',instrumentType:'EQUITY',price,shares,asOf:at};
 return {kind:'valuation',hash:'fixture',savedAt:at,financial,assumptions,quote,valuation:valueThesis(financial,assumptions,quote,at)};
}
