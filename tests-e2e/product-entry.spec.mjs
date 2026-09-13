import {test,expect} from './filing-test-fixtures.mjs';
test('a visitor can inspect the real example before auth, including a portfolio illustration',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=[];page.on('request',r=>{if(r.url().includes('/api/product-events'))calls.push(r)});
 await page.goto('/?lang=es');await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
 await page.getByRole('link',{name:'Ver un ejemplo real'}).click();await expect(page).toHaveURL(/\/example/);
 await expect(page.getByRole('heading',{name:'01 / Qué cambió'})).toBeVisible();
 await expect(page.getByText('74.071',{exact:true})).toBeVisible();
 await page.getByLabel('Peso de la posición (%)').fill('20');await page.getByLabel('Caída hipotética (%)').fill('50');
 await expect(page.locator('output')).toHaveText('−10% del valor de la cartera');
 await page.getByText('Verificar fuente y cálculo',{exact:true}).click();
 await expect(page.getByRole('link',{name:'Microsoft · Annual Report 2025'})).toHaveAttribute('href','https://www.microsoft.com/investor/reports/ar25/index.html');
 expect(calls).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('link',{name:'Investigar Microsoft',exact:false}).click();
 if(!process.env.BLS_E2E_AUTHENTICATED){await expect(page).toHaveURL(/intent=signup/);await expect(page.locator('input[name="next"]')).toHaveValue('/research?ticker=MSFT&lang=es')}
 expect(errors).toEqual([]);
});
test('usage measurement is opt-in, bounded to named events, and revocable',async({page})=>{
 const calls=[];await page.route('**/api/product-events',r=>{calls.push(r.request().postDataJSON());return r.fulfill({status:204})});
 await page.goto('/?lang=es');expect(calls).toHaveLength(0);
 await page.getByRole('button',{name:'Permitir medición'}).click();await expect.poll(()=>calls.length).toBe(1);
 expect(Object.keys(calls[0]).sort()).toEqual(['consent','event','visitor']);expect(calls[0].event).toBe('visit');
 await page.getByRole('link',{name:'Ver un ejemplo real'}).click();await expect.poll(()=>calls.length).toBe(2);
 await page.reload();await expect(page.getByRole('button',{name:'Desactivar',exact:true})).toBeVisible();expect(calls.length).toBe(2);
 await page.getByRole('button',{name:'Desactivar',exact:true}).click();await page.goto('/?lang=es');expect(calls.length).toBe(2);
});
test('Do Not Track prevents transmission even with opt-in',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{value:'1'}));const calls=[];await page.route('**/api/product-events',r=>{calls.push(1);return r.fulfill({status:204})});
 await page.goto('/?lang=es');await page.getByRole('button',{name:'Permitir medición'}).click();await page.getByRole('link',{name:'Ver un ejemplo real'}).click();expect(calls).toHaveLength(0);
});
