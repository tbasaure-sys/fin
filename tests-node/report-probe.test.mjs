import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {referenceProviderPayload} from './fixtures/reference-provider.mjs';
const dossier=createRequire(import.meta.url)('../lib/research/published/MSFT.json');
const execute=promisify(execFile),probePath=fileURLToPath(new URL('../scripts/probe-filing-report.mjs',import.meta.url));
async function implementation(){let m;try{m=await import('../scripts/probe-filing-report.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}assert.ok(m,'the full-report probe must exist');return m}
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'bls-probe-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir}
const answer=()=>({sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'La empresa describe actividades y riesgos.',evidence:[{chunkId:s.extracts[0].id}]}],unknowns:[],checks:[]}))});
const review=()=>({reviews:dossier.sections.map(s=>({id:`${s.id}:0`,verdict:'supported',reason:'Fixture approval, not semantic certification.',allClausesSupported:true,scopeLimited:true,catalystStatus:'not_claimed',support:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text}]}))});
const response=raw=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(referenceProviderPayload(raw,dossier))}}],usage:{total_tokens:12}});

test('full-report probe is offline by default and cannot overwrite its frozen input',async t=>{
 const m=await implementation(),directory=join(await workspace(t),'run');
 const manifest=await m.prepareProbe({dossier,directory});let calls=0;
 const result=await m.runProbe({directory,fetcher:()=>{calls++;throw Error('unexpected network')}});
 assert.equal(calls,0);assert.equal(result.status,'prepared');assert.equal(result.qualityCertified,false);
 assert.equal(manifest.dossierHash.length,64);assert.ok(manifest.engine.files['lib/research/source-scope-check.mjs']);
 await assert.rejects(m.prepareProbe({dossier,directory}),/EEXIST/);
});

test('dependency changes invalidate the same probe even when the entrypoint is unchanged',async t=>{
 const m=await implementation(),root=await workspace(t);await mkdir(join(root,'lib'),{recursive:true});
 await writeFile(join(root,'lib','entry.mjs'),"import './dependency.mjs';");await writeFile(join(root,'lib','dependency.mjs'),'export const value=1;');
 for(const file of ['package.json','package-lock.json'])await writeFile(join(root,file),'{}');
 const initial=await m.sourceIdentity(root);await writeFile(join(root,'lib','dependency.mjs'),'export const value=2;');
 const changed=await m.sourceIdentity(root);assert.equal(initial.files['lib/entry.mjs'],changed.files['lib/entry.mjs']);
 assert.throws(()=>m.assertProbeIdentity(initial,changed),/PROBE_CODE_CHANGED/);
});

test('provider cooldown retains the draft and resumes review without another draft or leaked credentials',async t=>{
 const m=await implementation(),directory=join(await workspace(t),'run');await m.prepareProbe({dossier,directory});let calls=0;
 const apiKey='secret-only-for-this-test',fetcher=async()=>++calls===1?response(answer()):new Response(JSON.stringify({error:{code:'rate_limit_exceeded',message:'Limit: 1000 Requested: 2383 (TPM) account-private-detail'}}),{status:429,headers:{'retry-after':'60'}});
 const first=await m.runProbe({directory,live:true,apiKey,fetcher});assert.equal(first.status,'pending');assert.equal(calls,2);
 assert.equal(first.qualityCertified,false);assert.equal(first.analysis,undefined);
 const waiting=await m.runProbe({directory,live:true,apiKey,fetcher});assert.equal(waiting.status,'waiting');assert.equal(calls,2);
 const done=await m.runProbe({directory,live:true,apiKey,now:()=>first.notBefore+1,fetcher:async()=>{calls++;return response(review())}});
 assert.equal(calls,3);assert.equal(done.status,'finished');assert.equal(done.delivery.status,'partial');assert.equal(done.qualityCertified,false);
 assert.equal(done.error,null,'a recovered report must not retain a pending error as its final status');
 assert.equal(done.analysis.sections[0].findings.length,1);
 const files=await readdir(directory);assert.equal(files.filter(f=>/^response-/.test(f)).length,3);
 const limited=JSON.parse(await readFile(join(directory,'response-2.json'),'utf8'));
 assert.deepEqual(limited.capacity,{limit:1000,requested:2383,dimension:'TPM'});
 for(const file of files){const content=await readFile(join(directory,file),'utf8');assert.ok(!content.includes(apiKey));assert.ok(!content.includes('account-private-detail'))}
 const repeated=await m.runProbe({directory,live:true,apiKey,fetcher});assert.equal(repeated.status,'finished');assert.equal(calls,3);
});

test('a valid state from another frozen run cannot be treated as this run result',async t=>{
 const m=await implementation(),root=await workspace(t),first=join(root,'first'),second=join(root,'second');
 await m.prepareProbe({dossier,directory:first});await m.prepareProbe({dossier:{...dossier,name:'Different dossier'},directory:second});
 await writeFile(join(first,'state.json'),await readFile(join(second,'state.json')));
 await assert.rejects(m.runProbe({directory:first}),/PROBE_STATE_MISMATCH/);
});

test('a preset not-before and a writer lock prevent early or concurrent model calls',async t=>{
 const m=await implementation(),directory=join(await workspace(t),'run'),notBefore=Date.now()+120000;
 await m.prepareProbe({dossier,directory,notBefore});let calls=0;const fetcher=()=>{calls++;throw Error('unexpected network')};
 assert.equal((await m.runProbe({directory,live:true,apiKey:'test',fetcher})).status,'waiting');
 await writeFile(join(directory,'writer.lock'),'existing writer');
 await assert.rejects(m.runProbe({directory,live:true,apiKey:'test',fetcher}),/PROBE_WRITER_ACTIVE/);assert.equal(calls,0);
});

test('a terminal report failure stays visible and is not silently restarted',async t=>{
 const m=await implementation(),directory=join(await workspace(t),'run');await m.prepareProbe({dossier,directory});let calls=0;
 const fetcher=async()=>{calls++;return new Response(JSON.stringify({error:{code:'model_not_found'}}),{status:404})};
 const failed=await m.runProbe({directory,live:true,apiKey:'test',fetcher});assert.equal(failed.status,'failed');assert.equal(failed.error,'PROVIDER_UNAVAILABLE');
 assert.equal((await m.runProbe({directory,live:true,apiKey:'test',fetcher})).status,'failed');assert.equal(calls,1);
 await assert.rejects(execute(process.execPath,['--conditions=react-server',probePath,'--directory',directory,'--live'],{env:{...process.env,GROQ_API_KEY:''}}),e=>e.code===1&&e.stdout.includes('"status":"failed"'));
});

test('the CLI yields before generation when its budget cannot cover one invocation',async t=>{
 const m=await implementation(),directory=join(await workspace(t),'run');await m.prepareProbe({dossier,directory});
 const {stdout}=await execute(process.execPath,['--conditions=react-server',probePath,'--directory',directory,'--live','--budget-seconds','1'],{env:{...process.env,GROQ_API_KEY:''}});
 assert.match(stdout,/budget_yield/);const state=await m.runProbe({directory});assert.equal(state.calls,0);
});
