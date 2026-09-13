import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {getPublicAppUrl} from '../lib/server/config.js';
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/headers'||specifier==='next/navigation')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export function cookies(){throw Error("Unexpected request context")};export function redirect(){throw Error("Unexpected redirect")}')};
 return next(specifier,context);
}});
const {getSessionCookieOptions}=await import('../lib/server/auth/session.js');
function environment(values,run){
 const before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
 try{for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}return run();}
 finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
const production={NODE_ENV:'production',VERCEL_ENV:'production',VERCEL_URL:'fin-hash-team.vercel.app',BLS_PRIME_APP_URL:'https://www.blsprime.com',BLS_PRIME_COOKIE_DOMAIN:undefined};
test('preview reset links stay on the deployment and session cookies cannot target production or all vercel apps',()=>{
 for(const domain of [undefined,'.blsprime.com','.vercel.app'])environment({...production,VERCEL_ENV:'preview',BLS_PRIME_COOKIE_DOMAIN:domain},()=>{
  assert.equal(getPublicAppUrl(),'https://fin-hash-team.vercel.app');
  const options=getSessionCookieOptions(new Date('2026-10-01T00:00:00Z'));
  assert.equal(Object.hasOwn(options,'domain'),false);assert.equal(options.secure,true);
  assert.equal(options.httpOnly,true);assert.equal(options.sameSite,'lax');assert.equal(options.path,'/');
 });
});
test('production keeps its configured public URL and cookie scope',()=>{
 environment(production,()=>{
  assert.equal(getPublicAppUrl(),'https://www.blsprime.com');
  assert.equal(getSessionCookieOptions(new Date()).domain,'.blsprime.com');
 });
 environment({...production,BLS_PRIME_COOKIE_DOMAIN:'app.example.com'},()=>assert.equal(getSessionCookieOptions(new Date()).domain,'app.example.com'));
});
test('a missing or malformed preview host fails closed instead of sending account links to production',()=>{
 for(const host of [undefined,'','https://fin.vercel.app','fin.vercel.app/path','fin.vercel.app@evil.test','fin.vercel.app.evil.test']){
  environment({...production,VERCEL_ENV:'preview',VERCEL_URL:host},()=>assert.throws(()=>getPublicAppUrl(),/PREVIEW_URL_UNAVAILABLE/));
 }
});
test('local development is not redirected to a leftover Vercel hostname',()=>{
 environment({...production,NODE_ENV:'development',VERCEL_ENV:'development',BLS_PRIME_APP_URL:'http://localhost:3008'},()=>{
  assert.equal(getPublicAppUrl(),'http://localhost:3008');
  assert.equal(Object.hasOwn(getSessionCookieOptions(new Date()),'domain'),false);
 });
});
