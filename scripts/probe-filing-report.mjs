// Opt-in, full production generator probe. No database publication, auth bypass,
// rewritten model responses, provider fallback or automatic quality certification.
import {readFile,writeFile,readdir,mkdir,open,rename,unlink} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {generateAnalysis,VERSION} from '../lib/server/filing-analysis.js';
import {hash} from '../lib/research/filing-engine.mjs';
import {reportDelivery} from '../lib/research/report-delivery.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SELF=fileURLToPath(import.meta.url);
export async function sourceIdentity(root=ROOT){
 const files={};
 async function walk(directory){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(directory,entry.name);
   if(entry.isSymbolicLink())throw Error('PROBE_SYMLINK_IN_CODE');
   if(entry.isDirectory())await walk(path);
   else if(/\.(?:m?js|json)$/.test(entry.name))files[relative(root,path).replaceAll('\\','/')]=hash(await readFile(path));
  }
 }
 await walk(join(root,'lib'));
 for(const name of ['package.json','package-lock.json'])files[name]=hash(await readFile(join(root,name)));
 files['scripts/probe-filing-report.mjs']=hash(await readFile(SELF));
 return {files,node:process.version,hash:hash({files,node:process.version})};
}
export function assertProbeIdentity(expected,actual){if(hash(expected)!==hash(actual))throw Error('PROBE_CODE_CHANGED')}
const loadedIdentity=sourceIdentity();
const envelope=value=>({...value,checksum:hash(value)});
async function readChecked(path){const {checksum,...value}=JSON.parse(await readFile(path,'utf8'));if(hash(value)!==checksum)throw Error('PROBE_ARTIFACT_CHANGED');return value}
async function saveState(directory,value){
 const temp=join(directory,`state-${randomUUID()}.tmp`);
 await writeFile(temp,JSON.stringify(envelope(value),null,2),{flag:'wx'});
 await rename(temp,join(directory,'state.json'));
}
export async function prepareProbe({dossier,directory,notBefore=0,language='es'}){
 if(!Number.isFinite(notBefore)||notBefore<0||!['es','en'].includes(language))throw Error('INVALID_PROBE_OPTIONS');
 if(!dossier||!Array.isArray(dossier.sources)||!dossier.sources.length||!Array.isArray(dossier.sections)
  ||dossier.sections.map(s=>s.id).join()!=='business,cash,thesis'||!Number.isFinite(Date.parse(dossier.asOf)))throw Error('INVALID_PROBE_DOSSIER');
 const ids=new Set();
 for(const source of dossier.sources){
  const url=new URL(source.url);
  if(url.protocol!=='https:'||url.hostname!=='www.sec.gov'||!url.pathname.startsWith('/Archives/edgar/data/')||url.username||url.password
   ||!/^[a-f0-9]{64}$/.test(source.sha256)||ids.has(source.id)||!Number.isFinite(Date.parse(source.acceptedAt))
   ||Date.parse(source.acceptedAt)>Date.parse(dossier.asOf))throw Error('INVALID_PROBE_SOURCE');
  ids.add(source.id);
 }
 for(const section of dossier.sections)if(!Array.isArray(section.extracts)||section.extracts.some(c=>typeof c.text!=='string'||!ids.has(c.id?.split(':')[0])))throw Error('INVALID_PROBE_EXTRACT');
 const engine=await sourceIdentity();assertProbeIdentity(await loadedIdentity,engine);
 const manifest={version:'full-report-probe-v1',engineVersion:VERSION,engine,dossier,dossierHash:hash(dossier),language,notBefore,
  createdAt:new Date().toISOString(),qualityCertified:false,purpose:'Full generator development observation; not an independent quality or competitor benchmark'};
 await mkdir(directory); // A fresh explicit directory; never replace a previous run.
 await writeFile(join(directory,'manifest.json'),JSON.stringify(envelope(manifest),null,2),{flag:'wx'});
 await saveState(directory,{manifestHash:hash(manifest),status:'prepared',checkpoint:null,notBefore,calls:0,qualityCertified:false});
 return manifest;
}
export async function runProbe({directory,live=false,apiKey=process.env.GROQ_API_KEY,fetcher=fetch,now=Date.now,onEvent=()=>{}}){
 directory=resolve(directory);let lock;
 try{lock=await open(join(directory,'writer.lock'),'wx')}catch(e){if(e.code==='EEXIST')throw Error('PROBE_WRITER_ACTIVE');throw e}
 await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
 try{
  const manifest=await readChecked(join(directory,'manifest.json'));
  if(hash(manifest.dossier)!==manifest.dossierHash)throw Error('PROBE_INPUT_CHANGED');
  const identity=await sourceIdentity();assertProbeIdentity(await loadedIdentity,identity);assertProbeIdentity(manifest.engine,identity);
  let state=await readChecked(join(directory,'state.json'));
  if(state.manifestHash!==hash(manifest))throw Error('PROBE_STATE_MISMATCH');
  if(['finished','failed'].includes(state.status)||!live)return state;
  // If a process died between sending and recording, do not silently duplicate it.
  if(state.calls){
   let prior;try{prior=await readChecked(join(directory,`response-${state.calls}.json`))}catch(e){if(e.code==='ENOENT')throw Error('PROBE_UNRESOLVED_PROVIDER_CALL');throw e}
   const retry=Number(prior.headers?.['retry-after']);
   if(prior.http===429&&Number.isFinite(retry)&&retry>0)state.notBefore=Math.max(state.notBefore,prior.receivedAt+retry*1000);
  }
  if(now()<state.notBefore)return {...state,status:'waiting'};
  if(!apiKey?.trim())throw Error('PROVIDER_UNAVAILABLE');
  state.status='running';await saveState(directory,state);
  const diagnostics=[];
  try{
   const analysis=await generateAnalysis(manifest.dossier,{apiKey,language:manifest.language,resume:state.checkpoint,
    diagnose:event=>{diagnostics.push(event);onEvent({kind:'diagnostic',...event})},
    onCheckpoint:async checkpoint=>{state.checkpoint=checkpoint;await saveState(directory,state)},
    fetcher:async(url,options)=>{
     assertProbeIdentity(manifest.engine,await sourceIdentity());
     const request=JSON.parse(options.body),id=++state.calls;
     await writeFile(join(directory,`request-${id}.json`),JSON.stringify(envelope({request,requestHash:hash(request),startedAt:now()}),null,2),{flag:'wx'});
     await saveState(directory,state);
     let response;
     try{response=await fetcher(url,options)}catch(error){
      await writeFile(join(directory,`response-${id}.json`),JSON.stringify(envelope({http:null,receivedAt:now(),error:'TRANSPORT_FAILURE'})),{flag:'wx'});throw error;
     }
     const raw=await response.clone().json().catch(()=>null);
     // Never persist request headers, provider account identifiers or error messages.
     const headers=Object.fromEntries(['retry-after','x-ratelimit-limit-tokens','x-ratelimit-remaining-tokens','x-ratelimit-reset-tokens'].map(k=>[k,response.headers.get(k)]));
     const message=typeof raw?.error?.message==='string'?raw.error.message:'';
     const quantity=label=>{const match=message.match(new RegExp(`\\b${label}\\s*[:=]?\\s*(\\d[\\d,]*)`,'i'));return match?Number(match[1].replaceAll(',','')):null};
     const capacity={limit:quantity('Limit'),requested:quantity('Requested'),dimension:message.match(/\b(?:TPM|TPD|RPD|RPM)\b/)?.[0]??null};
     const knownCodes=['json_validate_failed','invalid_api_key','model_not_found','model_decommissioned','rate_limit_exceeded','insufficient_quota'];
     const record={http:response.status,receivedAt:now(),headers,choices:raw?.choices??null,usage:raw?.usage??null,
      capacity,errorCode:raw?.error?knownCodes.includes(raw.error.code)?raw.error.code:'unclassified':null,failedGeneration:raw?.error?.failed_generation??null};
     await writeFile(join(directory,`response-${id}.json`),JSON.stringify(envelope(record),null,2),{flag:'wx'});
     onEvent({kind:'provider_response',id,http:response.status,retryAfter:headers['retry-after']});return response;
    }});
   assertProbeIdentity(manifest.engine,await sourceIdentity());
   state={...state,status:'finished',error:null,stage:null,issue:null,analysis,delivery:reportDelivery(analysis),qualityCertified:false};
  }catch(error){
   state={...state,status:error.message==='REPORT_PENDING'?'pending':'failed',error:error.message,stage:error.stage??null,issue:error.issue??null,qualityCertified:false};
   if(state.status==='pending')state.notBefore=now()+error.retryAfterSeconds*1000;
  }
  state.diagnostics=[...(state.diagnostics||[]),...diagnostics];await saveState(directory,state);return state;
 }finally{await lock.close();await unlink(join(directory,'writer.lock'))}
}

async function cli(){
 const args=process.argv.slice(2),option=key=>args[args.indexOf(key)+1],has=key=>args.includes(key);
 if(!has('--directory'))throw Error('Usage: --directory NEW_RUN --prepare --input DOSSIER_JSON [--not-before ISO] OR --directory RUN [--live] [--wait --budget-seconds 1200]');
 const directory=resolve(option('--directory'));
 if(has('--prepare')){
  if(!has('--input'))throw Error('PROBE_INPUT_REQUIRED');
  const input=JSON.parse(await readFile(option('--input'),'utf8'));
  const manifest=await prepareProbe({directory,dossier:input.dossier??input,language:has('--language')?option('--language'):'es',notBefore:has('--not-before')?Date.parse(option('--not-before')):0});
  console.log(JSON.stringify({status:'prepared',networkCalls:0,directory,dossierHash:manifest.dossierHash,engineHash:manifest.engine.hash,notBefore:manifest.notBefore}));return;
 }
 const budget=has('--budget-seconds')?Number(option('--budget-seconds')):1200;
 if(!Number.isFinite(budget)||budget<1||budget>3600)throw Error('INVALID_PROBE_BUDGET');
 const deadline=Date.now()+budget*1000;
 for(;;){
  if(has('--live')&&deadline-Date.now()<45000){console.log(JSON.stringify({status:'budget_yield',directory}));return}
  const state=await runProbe({directory,live:has('--live'),onEvent:console.log});
  console.log(JSON.stringify({status:state.status,calls:state.calls,stage:state.stage,notBefore:state.notBefore,error:state.error,delivery:state.delivery,qualityCertified:false}));
  if(!has('--live')||!has('--wait')||!['waiting','pending'].includes(state.status)){if(state.status==='failed')process.exitCode=1;return}
  if(state.notBefore+45000>deadline){console.log(JSON.stringify({status:'budget_yield',directory}));return}
  while(Date.now()<state.notBefore){
   console.log(JSON.stringify({status:'cooldown',pid:process.pid,secondsRemaining:Math.ceil((state.notBefore-Date.now())/1000)}));
   await new Promise(r=>setTimeout(r,Math.min(55000,state.notBefore-Date.now())));
  }
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)cli().catch(error=>{console.error(error.message);process.exitCode=1});
