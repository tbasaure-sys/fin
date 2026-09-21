import test from 'node:test';
import assert from 'node:assert/strict';
import {questionsFor,validateJevAnswer,newsPairs,reviewPriority,headlineNamesCompany,gateNewsAnswers} from '../lib/research/jev.mjs';
import {createJevCompanyDirectory} from '../lib/server/jev-company-directory.js';
import {createJevService} from '../lib/server/jev-service.js';
import {createJevHttp} from '../lib/server/jev-http.js';
import {hash} from '../lib/research/filing-engine.mjs';
const answer=(q,selected=Object.keys(q.criteria)[0])=>({type:'choice',choice:selected,confidence:0.9,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))});
const provider=async(_url,options)=>{const body=JSON.parse(options.body);return Response.json({model:'jev-1.13.0',answers:Object.fromEntries(Object.entries(body.questions).map(([k,q])=>[k,answer(q)]))})};
test('validates probability distributions, categories, finite values and winner',()=>{
 const q=questionsFor('news',0).tone,a=answer(q);
 assert.equal(validateJevAnswer(a,q).uncertain,false);
 for(const bad of [{...a,confidence:NaN},{...a,choice:'buy'},{...a,probabilities:{positive:1}},{...a,probabilities:{...a.probabilities,negative:1}},{...a,choice:'negative'}])assert.throws(()=>validateJevAnswer(bad,q));
 assert.equal(validateJevAnswer({...a,confidence:0.4},q).uncertain,true);
 assert.equal(validateJevAnswer(answer(q,'unknown'),q).uncertain,true);
});
test('unconfigured service makes no call; failures never expose provider bodies',async()=>{
 assert.equal((await createJevService({env:{},fetcher:()=>assert.fail()}).evaluate('news',[{id:'x'}])).status,'not_configured');
 for(const status of [401,403,429,500]){
  const result=await createJevService({env:{TYPESAFE_API_KEY:'secret'},fetcher:async()=>new Response('private-provider-details',{status})}).evaluate('news',[{id:'x'}]);
  assert.ok(!JSON.stringify(result).includes('private-provider-details'));assert.equal(result.items[0].answers,null);
 }
});
test('fixed endpoint, secret header, explicit item instructions, news cache and no private cache',async()=>{
 let calls=0;
 const service=createJevService({env:{TYPESAFE_API_KEY:'secret'},fetcher:async(url,options)=>{
  calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(options.headers.Authorization,'Bearer secret');assert.equal(options.redirect,'error');
  const b=JSON.parse(options.body);assert.equal(b.model,'jev-1.13.0');assert.match(b.questions.i0_relevance?.instructions||b.questions.i0_relation.instructions,/state.items\[0\]/);return provider(url,options);
 }});
 const items=[{id:'0',title:'Example'}];
 const r=await service.evaluate('news',items);assert.equal(r.status,'available');await service.evaluate('news',items);assert.equal(calls,1);
 await service.evaluate('thesis',items);await service.evaluate('thesis',items);assert.equal(calls,3);
});
test('malformed, oversized and wrong schema responses fail closed',async()=>{
 for(const response of [()=>new Response('not json'),()=>Response.json({model:'jev-1.13.0',answers:{}}),()=>new Response('x'.repeat(500001))]){
  const r=await createJevService({env:{TYPESAFE_API_KEY:'s'},fetcher:async()=>response()}).evaluate('news',[{id:'a'}]);assert.equal(r.status,'unavailable');
 }
});
test('batch failures preserve successful items and cap parallelism',async()=>{
 let active=0,peak=0;
 const service=createJevService({env:{TYPESAFE_API_KEY:'s'},fetcher:async(url,opts)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return JSON.parse(opts.body).state.items[0].id==='10'?new Response('',{status:429}):provider(url,opts)}});
 const r=await service.evaluate('news',Array.from({length:60},(_,i)=>({id:String(i)})));
 assert.equal(r.status,'partial');assert.equal(r.items.filter(i=>i.answers).length,50);assert.ok(peak<=3);assert.equal(r.items[10].id,'10');
});
test('long thesis revisions are divided into bounded evidence batches',async()=>{
 let calls=0;
 const service=createJevService({env:{TYPESAFE_API_KEY:'s'},fetcher:async(url,opts)=>{calls++;assert.ok(JSON.parse(opts.body).state.items.length<=2);return provider(url,opts)}});
 const r=await service.evaluate('thesis',Array.from({length:6},(_,i)=>({id:String(i),statement:'x'.repeat(2000),evidence:Array.from({length:8},()=>({text:'x'.repeat(2000)}))})));
 assert.equal(r.status,'available');assert.equal(calls,3);
});
test('company pairs round robin, deduplicate and preserve unknown portfolio values',()=>{
 const article=i=>({url:`https://example.com/${i}`,title:'News',symbols:['A','B']});
 const feed={results:[{ticker:'A',weight:0.8,articles:Array.from({length:70},(_,i)=>article(i))},{ticker:'B',weight:null,articles:[article(0)]}]};
 const r=newsPairs(feed,'portfolio');assert.equal(r.total,71);assert.equal(r.items.length,60);assert.equal(r.items[1].ticker,'B');assert.equal(r.items[1].weight,null);
 assert.equal(newsPairs({articles:[article(0)]},'market').total,2);
 const q=questionsFor('news',0);const a={relevance:validateJevAnswer(answer(q.relevance),q.relevance),materiality:validateJevAnswer(answer(q.materiality),q.materiality)};
 assert.equal(reviewPriority({weight:0.8},a),0.8);assert.equal(reviewPriority({weight:null},a),null);assert.equal(reviewPriority({weight:0.8},{...a,relevance:{...a.relevance,uncertain:true}}),null);
});
test('competitor headlines cannot become direct target-company signals',()=>{
 const q=questionsFor('news',0),a=Object.fromEntries(Object.entries(q).map(([k,v])=>[k,validateJevAnswer(answer(v),v)]));
 const nike={ticker:'ONON',companyName:'On Holding AG',title:'NKE Stock In Focus After Stifel Lowers Price Target To $40',weight:0.1};
 const gated=gateNewsAnswers(nike,a);assert.equal(gated.relevance.uncertain,true);assert.equal(gated.tone.uncertain,true);assert.equal(reviewPriority(nike,gated),null);
 assert.equal(headlineNamesCompany('On Holding announces a partnership','ONON','On Holding AG'),true);
 assert.equal(headlineNamesCompany('ONON (ONON) reports earnings','ONON',null),true);
 assert.equal(headlineNamesCompany('MS NOW barred from press event','NOW','ServiceNow, Inc.'),false);
 assert.equal(headlineNamesCompany('ServiceNow wins contract','NOW','ServiceNow, Inc.'),true);
 assert.equal(headlineNamesCompany('Someone is holding stock','ONON','On Holding AG'),false);
 const analyst=gateNewsAnswers({...nike,title:'On Holding downgraded'}, {...a,event:{...a.event,choice:'analyst'}});assert.equal(analyst.materiality.uncertain,true);
});
test('issuer directory caches public names and tolerates source outages',async()=>{
 let calls=0;const load=createJevCompanyDirectory({fetcher:async()=>{calls++;return Response.json({0:{ticker:'ONON',title:'On Holding AG'}})}});
 assert.equal((await load()).get('ONON'),'On Holding AG');await load();assert.equal(calls,1);
 assert.equal((await createJevCompanyDirectory({fetcher:async()=>new Response('',{status:503})})()).size,0);
});
const session={user:{id:'owner'},workspace:{id:'space'}};
const req=(body,origin='https://bls.test')=>new Request('https://bls.test/api/research/jev',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
function handler(overrides={}){return createJevHttp({authenticate:async()=>session,service:{configured:()=>true,evaluate:async(kind,items)=>({status:'available',items:items.map(i=>({id:i.id,status:'available',answers:null}))})},market:{},store:{},verify:()=>false,readPortfolio:()=>assert.fail(),...overrides})}
test('authentication and same-origin protections run before paid calls',async()=>{
 const auth=handler({authenticate:async()=>new Response('',{status:401}),service:{configured:()=>assert.fail()}});
 const response=await auth(req({kind:'news'}));assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal((await handler()(req({kind:'news'},'https://evil.test'))).status,403);
 assert.equal((await handler({consume:async()=>({allowed:false})})(req({kind:'news'}))).status,429);
 assert.equal((await handler()(req({kind:'oops'}))).status,400);
 assert.equal((await handler()(req({kind:'news',padding:'x'.repeat(200001)}))).status,413);
});
test('portfolio identity comes from session and private weights never leave server',async()=>{
 let sent;
 const run=handler({readPortfolio:async(owner,workspace)=>{assert.equal(owner,'owner');assert.equal(workspace,'space');return {status:'available',holdings:[{ticker:'A'}]}},market:{portfolio:async()=>({results:[{ticker:'A',weight:0.75,articles:[{title:'news',url:'https://example.com',date:'2026-09-21'}]}]})},service:{configured:()=>true,evaluate:async(kind,items)=>{sent=items;return {status:'available',items:items.map(i=>({id:i.id,status:'available',answers:null}))}}}});
 const r=await (await run(req({kind:'news',scope:'portfolio',owner:'someone-else',tickers:['EVIL']}))).json();
 assert.equal(r.items[0].weight,0.75);assert.ok(!JSON.stringify(sent).includes('0.75'));assert.ok(!JSON.stringify(sent).includes('owner'));assert.ok(!JSON.stringify(sent).includes('https://'));
});
test('documents require signed evidence and cap excerpts without fabricating coverage',async()=>{
 assert.equal((await handler()(req({kind:'documents',question:'What happened?',dossier:{}}))).status,409);
 const dossier={ticker:'A',asOf:'2026-09-21',sources:[{id:'s',url:'https://sec.gov/test'}],sections:[{extracts:Array.from({length:30},(_,i)=>({id:`s:${i}`,text:'x'.repeat(3000)}))}]};
 const r=await (await handler({verify:()=>true})(req({kind:'documents',question:'What happened?',dossier,ticket:'valid'}))).json();
 assert.equal(r.total,30);assert.equal(r.selected,24);assert.equal(r.items[0].text.length,2500);assert.equal(r.items[0].truncated,true);
});
test('saved thesis access is owner scoped and checks record integrity',async()=>{
 const record={dossier:{ticker:'A',asOf:'2026-09-21',sections:[{extracts:[{id:'s:1',text:'Report'}]}]},thesis:{nodes:[{id:'business',statement:'Claim',evidence:[{chunkId:'s:1'}]}]}};
 record.evidenceHash=hash(record.dossier);record.hash=hash(record);
 const store={findHash:async(owner,key)=>{assert.equal(owner,'owner');assert.equal(key,record.hash);return record}};
 const r=await (await handler({store})(req({kind:'thesis',revisionHash:record.hash}))).json();assert.equal(r.items[0].evidence[0].text,'Report');
 assert.equal((await handler({store:{findHash:async()=>null}})(req({kind:'thesis',revisionHash:record.hash}))).status,404);
 record.thesis.nodes[0].statement='tampered';assert.equal((await handler({store})(req({kind:'thesis',revisionHash:record.hash}))).status,503);
});
