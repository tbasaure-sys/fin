import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../lib/research/filing-engine.mjs';
import {createCapitalService,createCapitalHttp} from '../lib/server/thesis-capital-service.js';
import {createMemoryCapitalStore} from '../lib/server/thesis-capital-store.js';
import {revisionFixture} from './fixtures/valuation-revision-input.mjs';
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

test('saved valuation revisions retain the owned baseline and attribute changes across thesis ancestry',async()=>{
 const base=revisionFixture(),root={dossier:thesis.dossier,evidenceHash:thesis.evidenceHash,parentHash:null};root.hash=hash(root);
 const child={dossier:thesis.dossier,evidenceHash:thesis.evidenceHash,parentHash:root.hash};child.hash=hash(child);
 const records=new Map([[root.hash,root],[child.hash,child]]),store=createMemoryCapitalStore();
 const service=createCapitalService({store,thesisStore:{findHash:async(owner,id)=>owner==='alice'?records.get(id):null},
  loadFinancial:async()=>({financial:base.financial,quote:base.quote}),readPortfolio:async()=>({status:'available',holdings:[]}),clock:()=>new Date(base.savedAt)});
 const save=async(thesisHash,assumptions)=>{const input=await service.run('alice','own',{action:'load',thesisHash});return service.run('alice','own',{action:'calculate',thesisHash,inputHash:input.hash,assumptions})};
 const first=await save(root.hash,base.assumptions),original=JSON.stringify(first);
 assert.equal(first.revisionBridge?.status,'no_prior');
 const second=await save(child.hash,{...base.assumptions,maintenanceRate:.01});
 assert.equal(second.revisionBridge?.before.hash,first.hash);
 assert.ok(Math.abs(second.revisionBridge.operating.assumptions+10)<1e-8);
 assert.equal(second.revisionBaseline.hash,first.hash);assert.deepEqual(second.revisionBaseline.financial,first.financial);
 assert.equal(second.revisionBaseline.revisionBaseline,undefined,'exports must not recursively nest the entire history');
 assert.equal(JSON.stringify(await store.find('alice',first.hash)),original);
 await assert.rejects(()=>service.run('bob','own',{action:'load',thesisHash:child.hash}),/THESIS_NOT_FOUND/);
});
test('owned revision is required before any provider call or private result disclosure',async()=>{
 const {service,loads}=setup();
 await assert.rejects(()=>service.run('bob','own',{action:'load',thesisHash:thesis.hash}),/THESIS_NOT_FOUND/);
 assert.equal(loads(),0);
 const inputs=await service.run('alice','own',{action:'load',thesisHash:thesis.hash});
 assert.equal(inputs.kind,'inputs');assert.equal(inputs.thesisHash,thesis.hash);
 await assert.rejects(()=>service.list('bob',thesis.hash),/THESIS_NOT_FOUND/);
 assert.equal((await service.list('alice',thesis.hash)).length,1);
});

test('refreshing inputs beyond the visible history cannot hide the previous valuation',async()=>{
 const base=revisionFixture(),store=createMemoryCapitalStore();let tick=0;
 const service=createCapitalService({store,thesisStore:{findHash:async(owner,id)=>owner==='alice'&&id===thesis.hash?thesis:null},
  loadFinancial:async()=>({financial:base.financial,quote:base.quote}),readPortfolio:async()=>({status:'available',holdings:[]}),
  clock:()=>new Date(Date.parse(base.savedAt)+tick++*1000)});
 let input=await service.run('alice','own',{action:'load',thesisHash:thesis.hash});
 const first=await service.run('alice','own',{action:'calculate',thesisHash:thesis.hash,inputHash:input.hash,assumptions:base.assumptions});
 for(let i=0;i<31;i++)input=await service.run('alice','own',{action:'load',thesisHash:thesis.hash});
 assert.ok((await service.list('alice',thesis.hash)).every(r=>r.kind==='inputs'));
 const second=await service.run('alice','own',{action:'calculate',thesisHash:thesis.hash,inputHash:input.hash,assumptions:{...base.assumptions,maintenanceRate:.01}});
 assert.equal(second.revisionBridge.before?.hash,first.hash);
 assert.ok(Math.abs(second.revisionBridge.operating.assumptions+10)<1e-8);
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
