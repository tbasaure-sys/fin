import {test as base,expect} from '@playwright/test';
// Optional protected-preview access, supplied only in the test process environment.
// Never attach a bypass header to another origin. Disable traces for protected QA.
export const test=base.extend({
 _previewAccess:[async({context,baseURL},use)=>{
  const token=process.env.BLS_PREVIEW_BYPASS;
  if(token)await context.route('**/*',route=>{
   const headers={...route.request().headers()};
   if(new URL(route.request().url()).origin===new URL(baseURL).origin)headers['x-vercel-protection-bypass']=token;
   return route.continue({headers});
  });
  await use();
 },{auto:true}],
 request:async({playwright,baseURL},use)=>{
  const request=await playwright.request.newContext({baseURL,extraHTTPHeaders:process.env.BLS_PREVIEW_BYPASS?{'x-vercel-protection-bypass':process.env.BLS_PREVIEW_BYPASS}:{}});
  await use(request);await request.dispose();
 },
});
export {expect};
