import {test,expect} from './filing-test-fixtures.mjs';
import path from 'node:path';

test('minimal portal invites research, renders its image and has no horizontal overflow',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
 await page.goto('/?lang=es');
 await expect(page).toHaveTitle(/BLS Prime/);
 await expect(page.getByRole('heading',{level:1})).toHaveText('El valor no siempreestá a la vista.');
 await expect(page.getByRole('link',{name:'Entrar a BLS Prime',exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'El método',exact:true})).toHaveAttribute('href','/methodology?lang=es');
 await page.evaluate(()=>document.fonts.ready);
 const image=await page.evaluate(()=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth);i.onerror=()=>resolve(0);i.src='/images/bls-threshold.png'}));expect(image).toBeGreaterThan(1000);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(await page.locator('body').innerText()).not.toMatch(/\b(?:groq|grok|sec)\b/i);
 if(process.env.BLS_QA_DIR)await page.screenshot({path:path.join(process.env.BLS_QA_DIR,`bls-portal-${info.project.name}.png`),animations:'disabled',fullPage:true});
 await page.getByRole('link',{name:'Entrar a BLS Prime',exact:false}).click();
 await expect(page).toHaveURL(/\/login\?/);
 expect(new URL(page.url()).searchParams.get('next')).toBe('/research?lang=es');
 await expect(page.getByRole('heading',{name:'Entra a tu workspace'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('direct research links preserve ticker and language through sign-in and sign-up',async({page})=>{
 await page.goto('/research?ticker=AAPL&lang=en');
 await expect(page).toHaveURL(/\/login\?/);
 const next=new URL(page.url()).searchParams.get('next');
 expect(next).toBe('/research?lang=en&ticker=AAPL');
 await expect(page.locator('input[name="next"]')).toHaveValue(next);
 await expect(page.getByText('Continue to company research after signing in.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Create a new account',exact:true}).click();
 expect(new URL(page.url()).searchParams.get('next')).toBe(next);
 await expect(page.getByRole('heading',{name:'Create your account',exact:true})).toBeVisible();
});

test('anonymous and forged-cookie requests cannot retrieve evidence or generate reports',async({request,page,baseURL})=>{
 for(const cookie of ['', 'bls_prime_session=forged']){
  for(const endpoint of ['/api/public/research?ticker=MSFT','/api/public/research?ticker=AAPL','/api/research/theses?ticker=MSFT']){
   const response=await request.get(endpoint,{headers:{cookie}});
   expect(response.status()).toBe(401);expect(await response.text()).not.toMatch(/packetHash|analysisAvailable|ticket/);
  }
  const response=await request.post('/api/public/research/analyze',{headers:{cookie,Origin:baseURL},data:{}});
  expect(response.status()).toBe(401);
  expect((await request.post('/api/research/theses',{headers:{cookie,Origin:baseURL},data:{owner:'forged'}})).status()).toBe(401);
 }
 await page.context().addCookies([{name:'bls_prime_session',value:'forged',url:baseURL}]);
 await page.goto('/research?ticker=AAPL&lang=es');
 await expect(page).toHaveURL(/\/login\?/);
 await expect(page.locator('[data-analysis]')).toHaveCount(0);
});

test('English portal and reduced-motion preference remain usable',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/?lang=en');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Value is not alwaysin plain sight.');
 await expect(page.getByRole('link',{name:'Enter BLS Prime',exact:false})).toBeVisible();
 expect(await page.locator('main').evaluate(el=>getComputedStyle(el.firstElementChild).animationName)).toBe('none');
 await page.getByRole('link',{name:'ES',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('El valor');
});
