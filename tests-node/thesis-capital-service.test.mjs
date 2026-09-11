import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../lib/research/filing-engine.mjs';
import {createCapitalService,createCapitalHttp} from '../lib/server/thesis-capital-service.js';
import {createMemoryCapitalStore} from '../lib/server/thesis-capital-store.js';
const at='2026-09-11T12:00:00Z';
const dossier={ticker:'ONE',cik:1,asOf:at,sources:[]};
const thesis={dossier,evidenceHash:hash(dossier)};thesis.hash=hash(thesis);
const setup=()=>{
 let loads=0;
 const store=createMemoryCapitalStore();
 const service=createCapitalService({store,thesisStore:{findHash:async(owner,id)=>owner==='alice'&&id===thesis.hash?thesis:null},
  loadFinancial:async()=>{loads++;return {financial:{ticker:'ONE',asOf:at,facts:{},identity:{},warnings:[]},quote:null}},
  readPortfolio:async(owner,workspace)=>{assert.equal(owner,'alice');assert.equal(workspace,'own');return {status:'available',holdings:[]}},clock:()=>new Date(at)});
 return {service,store,loads:()=>loads};
};
test('owned revision is required before any provider call or private result disclosure',async()=>{
 const {service,loads}=setup();
 await assert.rejects(()=>service.run('bob','own',{action:'load',thesisHash:thesis.hash}),/THESIS_NOT_FOUND/);
 assert.equal(loads(),0);
 const inputs=await service.run('alice','own',{action:'load',thesisHash:thesis.hash});
 assert.equal(inputs.kind,'inputs');assert.equal(inputs.thesisHash,thesis.hash);
 await assert.rejects(()=>service.list('bob',thesis.hash),/THESIS_NOT_FOUND/);
 assert.equal((await service.list('alice',thesis.hash)).length,1);
});
test('calculations pin stored inputs, reject injected financial facts and keep prior outputs immutable',async()=>{
 const {service}=setup(),inputs=await service.run('alice','own',{action:'load',thesisHash:thesis.hash});
 const body={action:'calculate',thesisHash:thesis.hash,inputHash:inputs.hash,assumptions:inputs.assumptions};
 const result=await service.run('alice','own',body);assert.equal(result.valuation.base,null);assert.equal(result.inputHash,inputs.hash);
 await assert.rejects(()=>service.run('alice','own',{...body,financial:{facts:'injected'}}),/INVALID_CAPITAL_REQUEST/);
 await assert.rejects(()=>service.run('alice','own',{...body,inputHash:'0'.repeat(64)}),/INPUTS_NOT_FOUND/);
 assert.equal((await service.list('alice',thesis.hash)).length,2);
});
test('HTTP authenticates first, rejects cross-origin writes and never accepts client workspace ownership',async()=>{
 const {service}=setup();let calls=0;
 const noAuth=createCapitalHttp({authenticate:async()=>new Response('',{status:401}),service:{run:()=>calls++}});
 assert.equal((await noAuth(new Request('https://blsprime.com/api/research/capital',{method:'POST'}))).status,401);assert.equal(calls,0);
 const handler=createCapitalHttp({authenticate:async()=>({user:{id:'alice'},workspace:{id:'own'}}),service});
 const request=(body,origin='https://blsprime.com')=>new Request('https://blsprime.com/api/research/capital',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handler(request({action:'load',thesisHash:thesis.hash},'https://evil.test'))).status,403);
 assert.equal((await handler(request({action:'load',thesisHash:thesis.hash,workspace:'victim'}))).status,400);
 const response=await handler(request({action:'load',thesisHash:thesis.hash}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
 assert.equal((await handler(request({x:'a'.repeat(17000)}))).status,413);
});
