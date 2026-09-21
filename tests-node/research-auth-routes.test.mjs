import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {transform} from 'next/dist/build/swc/index.js';
const stub=source=>'data:text/javascript,'+encodeURIComponent(source);
let authorized=false,loads=0,generations=0;
globalThis.__researchAuthTest={session:()=>authorized?{user:{id:'fixture'}}:null,load:()=>{loads++;return {ticker:'AAPL'}},generate:()=>{generations++;return Response.json({ok:true})}};
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('data:'))return next(specifier,context);
 if(specifier.endsWith('auth/session')||specifier.endsWith('auth/session.js'))return {shortCircuit:true,url:stub(`export async function getServerAuthSession(){return globalThis.__researchAuthTest.session()} export async function requireApiAuthSession(){return globalThis.__researchAuthTest.session()||Response.json({error:'Authentication required.'},{status:401})}`)};
 if(specifier==='next/server')return {shortCircuit:true,url:stub('export const NextResponse=Response;')};
 if(specifier==='next/headers')return {shortCircuit:true,url:stub('export function headers(){return new Headers({"x-test-lang":"en"})}')};
 if(specifier==='next/navigation')return {shortCircuit:true,url:stub('export function redirect(url){throw Object.assign(Error("REDIRECT"),{url})}')};
 if(specifier.includes('filing-analysis'))return {shortCircuit:true,url:stub('export const signDossier=()=>"ticket";export const createAnalysisHandler=()=>()=>globalThis.__researchAuthTest.generate();')};
 if(specifier.includes('filing-report-cache'))return {shortCircuit:true,url:stub('export const createReportStore=()=>({});')};
 if(specifier.includes('public-rate-limit'))return {shortCircuit:true,url:stub('export const consumePublicRateLimit=()=>{};')};
 if(specifier.includes('company-financial-service'))return {shortCircuit:true,url:stub('export const loadCompanyFinancials=()=>globalThis.__researchAuthTest.load();')};
 if(specifier.includes('filing-dossier-service'))return {shortCircuit:true,url:stub('export const loadFilingDossier=()=>globalThis.__researchAuthTest.load();')};
 if(specifier==='@/lib/research/dossier')return {shortCircuit:true,url:stub('export const cleanTicker=x=>x;')};
 if(specifier.endsWith('MSFT.json'))return {shortCircuit:true,url:stub('export default {ticker:"MSFT"};')};
 if(specifier.includes('i18n/locale'))return {shortCircuit:true,url:stub('export const LANGUAGE_REQUEST_HEADER="x-test-lang";export const normalizeLocale=x=>x;')};
 if(specifier.includes('research-workspace'))return {shortCircuit:true,url:stub('export const ResearchWorkspace=()=>null;')};
 if(specifier==='react/jsx-runtime')return {shortCircuit:true,url:stub('export const jsx=(type,props)=>({type,props});')};
 return next(specifier,context);
}});
async function load(relative,jsx=false){let source=await readFile(new URL(relative,import.meta.url),'utf8');if(jsx)source=(await transform(source,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}})).code;return import(stub(source))}
test('both research endpoints authenticate before dossier, signature, cache or model work',async()=>{
 const get=await load('../app/api/public/research/route.js'),post=await load('../app/api/public/research/analyze/route.js');
 for(const headers of [{},{cookie:'bls_prime_session=forged'}]){
  assert.equal((await get.GET(new Request('https://example.com/api/public/research?ticker=AAPL',{headers}))).status,401);
  assert.equal((await post.POST(new Request('https://example.com/api/public/research/analyze',{method:'POST',headers}))).status,401);
 }
 assert.equal(loads,0);assert.equal(generations,0);
 authorized=true;
 assert.equal((await get.GET(new Request('https://example.com/api/public/research?ticker=AAPL'))).status,200);
 assert.equal((await post.POST(new Request('https://example.com/api/public/research/analyze',{method:'POST'}))).status,200);
 assert.equal(loads,1);assert.equal(generations,1);authorized=false;
});
test('research SSR redirects anonymous visitors with language and ticker, not a data shell',async()=>{
 const page=await load('../app/research/page.js',true);
 await assert.rejects(()=>page.default({searchParams:{ticker:'AAPL'}}),e=>{const u=new URL(e.url,'https://example.com');assert.equal(u.pathname,'/login');assert.equal(u.searchParams.get('lang'),'en');assert.equal(u.searchParams.get('intent'),'signin');assert.equal(u.searchParams.get('next'),'/research?lang=en&ticker=AAPL');return true});
 authorized=true;assert.ok(await page.default({searchParams:{ticker:'AAPL'}}));authorized=false;
});

test('financial history authenticates before external requests and returns private responses',async()=>{
 const route=await load('../app/api/public/research/financials/route.js');authorized=false;const before=loads;
 assert.equal((await route.GET(new Request('https://example.com/api/public/research/financials?ticker=ONON'))).status,401);assert.equal(loads,before);
 authorized=true;const response=await route.GET(new Request('https://example.com/api/public/research/financials?ticker=ONON'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(loads,before+1);authorized=false;
});
