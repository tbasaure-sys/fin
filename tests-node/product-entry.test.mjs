import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicExample,exampleCashBridge} from '../lib/research/public-example.mjs';
import {validProductEvent} from '../lib/product-events.mjs';
test('public historical cash bridge is arithmetic, dated and source-linked',()=>{
 const result=exampleCashBridge();assert.deepEqual(result.residual,[74071,71611]);assert.ok(result.residualChange<0);assert.ok(result.cfoChange>0);assert.equal(publicExample.periodEnd,'2025-06-30');assert.match(publicExample.source,/^https:\/\/www.microsoft.com\//);
});
test('analytics rejects sensitive fields, unknown events and absent consent',()=>{
 const body={event:'visit',visitor:'12345678-1234-4123-8123-123456789012',consent:true};assert.equal(validProductEvent(body),true);
 for(const changed of [{ticker:'MSFT'},{holdings:[]},{email:'test@example.test'},{event:'arbitrary'},{consent:false},{visitor:'user@example.test'}])assert.equal(Boolean(validProductEvent({...body,...changed})),false);
});
test('financial evidence is the default and private valuation can begin without a written thesis',async()=>{
 const read=p=>readFile(new URL(p,import.meta.url),'utf8');
 assert.match(await read('../components/research/research-workspace.jsx'),/initialView="overview"/);
 assert.match(await read('../components/research/capital-workspace.jsx'),/Preparar mi análisis de cifras/);
 assert.match(await read('../app/research/page.js'),/getServerAuthSession/);
});
