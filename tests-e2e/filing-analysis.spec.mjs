import {test,expect} from './filing-test-fixtures.mjs';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const dossier=require('../lib/research/published/MSFT.json');
// Run these private UI fixtures only against a local authenticated test environment,
// or a QA context signed in through the real login flow. Never weaken production auth.
test.beforeEach(()=>test.skip(!process.env.BLS_E2E_AUTHENTICATED,'Requires authenticated test context'));
test.beforeEach(async({page})=>{
 await page.route('**/api/research/financial-reading',r=>r.fulfill({json:{packetHash:dossier.packetHash,reading:{version:'financial-reading-v1',ticker:dossier.ticker,asOf:dossier.asOf,status:'unresolved',periods:[]}}}));
 await page.route('**/api/research/theses?ticker=*',r=>r.fulfill({json:{revisions:[]}}));
 const goto=page.goto.bind(page);
 page.goto=async(...args)=>{const response=await goto(...args);await page.getByRole('button',{name:/^(Documentos y lectura|Documents & reading)$/}).click();return response};
});

test('an in-flight saved report retains its original dossier when downloaded',async({page})=>{
 let calls=0;const original={...dossier,asOf:'2026-08-01T00:00:00Z'};
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 await page.route('**/api/public/research/analyze',r=>++calls===1?r.fulfill({status:202,json:{pending:true}}):r.fulfill({json:{analysis:{status:'draft',sections:dossier.sections.map(s=>({id:s.id,findings:[],unknowns:[],checks:[]}))},reportDossier:original,cached:true}}));
 await page.goto('/research?ticker=MSFT&lang=es');
 await page.getByRole('button',{name:'Generar informe',exact:true}).click();
 await page.getByText('Fuentes, alcance y revisión',{exact:true}).click();
 await expect(page.getByText(/Informe guardado · recuperado/)).toBeVisible();expect(calls).toBe(2);
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar informe y fuentes'}).click();
 const download=await downloading;const content=JSON.parse(await readFile(await download.path(),'utf8'));expect(content.dossier.asOf).toBe(original.asOf);
});

test('findings lead the report, review diagnostics stay expandable, and empty output is not success',async({page})=>{
 const events=[];
 await page.route('**/api/product-events',r=>{events.push(r.request().postDataJSON());return r.fulfill({status:204})});
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 const analysis={status:'draft',generatedAt:'2026-09-13T00:00:00Z',language:'es',recovery:[{stage:'draft'}],review:{excluded:[{id:'business:0',reason:'Motivo técnico de prueba.'}]},
  sections:dossier.sections.map(s=>({id:s.id,findings:[],unknowns:[],checks:[]}))};
 await page.route('**/api/public/research/analyze',r=>r.fulfill({json:{analysis}}));
 await page.goto('/research?ticker=MSFT&lang=es');await page.getByRole('button',{name:'Permitir medición',exact:true}).click();await page.getByRole('button',{name:'Generar informe',exact:true}).click();
 await expect(page.locator('[data-analysis]')).toContainText('Análisis insuficiente');
 await expect(page.getByText('Motivo técnico de prueba.',{exact:false})).not.toBeVisible();
 expect(events.some(e=>e.event==='report_generated')).toBe(false);
 await page.getByText('Fuentes, alcance y revisión',{exact:true}).click();
 await expect(page.getByText('Motivo técnico de prueba.',{exact:false})).toBeVisible();
 await expect(page.locator('[data-analysis]').getByRole('link',{name:'Consultar las fuentes de esta sección'})).toBeVisible();
});

test('switching to thesis and back retains the reviewed report without another model call',async({page})=>{
 let calls=0;
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 await page.route('**/api/public/research/analyze',r=>{calls++;return r.fulfill({json:{analysis:{status:'draft',sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'Hallazgo conservado entre vistas.',evidence:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text}]}],unknowns:[],checks:[]}))}}})});
 await page.goto('/research?ticker=MSFT&lang=es');await page.getByRole('button',{name:'Generar informe',exact:true}).click();
 await expect(page.getByText('Hallazgo conservado entre vistas.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mi tesis',exact:true}).click();
 await page.getByRole('button',{name:'Documentos y lectura',exact:true}).click();
 await expect(page.getByText('Hallazgo conservado entre vistas.',{exact:true})).toBeVisible();expect(calls).toBe(1);
});

test('an empty topic identifies an analysis gap and exposes its original consulted passages, not a newer dossier',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const original=structuredClone(dossier);
 original.asOf='2026-08-01T00:00:00Z';
 const business=original.sections.find(s=>s.id==='business');
 business.extracts=[{...business.extracts[0],text:'Original consulted passage: the company offers subscription and support services.'}];
 const source=original.sources.find(s=>s.id===business.extracts[0].id.split(':')[0]);
 const analysis={status:'draft',sections:original.sections.map(s=>({id:s.id,
  findings:s.id==='business'?[]:[{kind:'interpretation',text:'Supported finding in another topic.',evidence:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text}]}],unknowns:[],checks:[]}))};
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 let calls=0;
 await page.route('**/api/public/research/analyze',r=>{calls++;return r.fulfill({json:{analysis,reportDossier:original,cached:true}})});
 await page.goto('/research?ticker=MSFT&lang=es');
 await page.getByRole('button',{name:'Generar informe',exact:true}).click();
 const report=page.locator('[data-analysis]');
 await expect(report.locator('[data-report-section-state]')).toHaveAttribute('data-report-section-state','insufficient');
 await expect(report).toContainText('El análisis no logró sostener una explicación');
 await expect(report).not.toContainText('Los documentos seleccionados no permitieron');
 await report.getByText('Ver los pasajes consultados',{exact:false}).click();
 await expect(report.locator('[data-consulted-sources] blockquote')).toHaveText(business.extracts[0].text);
 await expect(report.locator('[data-consulted-sources] a').first()).toHaveAttribute('href',source.url);
 await expect(report.locator('[data-consulted-sources]')).toContainText('2026-08-01');
 await page.getByRole('button',{name:/Caja y capital/}).click();
 await expect(report.locator('[data-report-section-state]')).toHaveAttribute('data-report-section-state','partial');
 await expect(report.getByText('Supported finding in another topic.',{exact:true})).toBeVisible();
 await expect(report.locator('[data-consulted-sources]')).toHaveCount(0);
 await page.getByRole('button',{name:/Negocio y calidad/}).click();
 expect(calls).toBe(1);
 await expect(page).toHaveURL(/research\?ticker=MSFT/);
 expect(await page.title()).not.toBe('');
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await report.scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath('report-section-gap.png')});
});

test('research controls and service errors use product language, not vendor names',async({page})=>{
 for(const language of ['es','en']){
  await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
  await page.route('**/api/public/research/analyze',r=>r.fulfill({status:429,json:{error:'PROVIDER_RATE_LIMIT'}}));
  await page.goto(`/research?ticker=MSFT&lang=${language}`);
  const button=page.getByRole('button',{name:language==='es'?'Generar informe':'Generate report',exact:true});
  await expect(button).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/\b(?:groq|grok|sec)\b/i);
  await button.click();await expect(page.locator('[data-analysis]').getByRole('alert')).toBeVisible();
  expect(await page.locator('[data-analysis]').innerText()).not.toMatch(/\b(?:groq|grok|sec)\b/i);
  await expect(page.locator('a[href^="https://www.sec.gov/"]').first()).toBeAttached();
 }
});
test('analysis requires a click, exposes sources, and survives topic changes',async({page})=>{
 let calls=0;
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 await page.route('**/api/public/research/analyze',async r=>{calls++;expect(r.request().postDataJSON().dossier.packetHash).toBe(dossier.packetHash);await r.fulfill({json:{analysis:{status:'draft',model:'openai/gpt-oss-20b',sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:`Lectura de prueba ${s.id}`,evidence:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text.slice(0,80)}]}],unknowns:['Dato pendiente de prueba'],checks:['Revisar siguiente filing']}))}}})});
 await page.goto('/research?ticker=MSFT&lang=es');
 const button=page.getByRole('button',{name:'Generar informe',exact:true});
 await expect(button).toBeVisible();expect(calls).toBe(0);
 await button.click();await expect(page.getByText('Lectura de prueba business',{exact:true})).toBeVisible();
 await expect(page.getByText('Análisis documental parcial',{exact:true})).toBeVisible();
 await page.getByText('Ver cita de respaldo').first().click();
 await expect(page.locator('[data-analysis] blockquote').first()).toBeVisible();
 await page.getByRole('button',{name:/Caja y capital/}).click();
 await expect(page.getByText('Lectura de prueba cash',{exact:true})).toBeVisible();expect(calls).toBe(1);
});
test('rate limit leaves documentary evidence accessible and explains the failure',async({page})=>{
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 await page.route('**/api/public/research/analyze',r=>r.fulfill({status:429,json:{error:'PROVIDER_RATE_LIMIT'}}));
 await page.goto('/research?ticker=MSFT&lang=es');
 await page.getByRole('button',{name:'Generar informe',exact:true}).click();
  await expect(page.locator('[data-analysis]').getByRole('alert')).toContainText('Se alcanzó un límite de capacidad');
 await expect(page.getByText('Extractos seleccionados',{exact:false}).first()).toBeVisible();
 await expect(page.getByText('Análisis automático pendiente',{exact:true})).toHaveCount(0);
});

test('exhausted repair exposes a traceable error, not a misleading pending banner',async({page})=>{
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:true}}));
 await page.route('**/api/public/research/analyze',r=>r.fulfill({status:503,json:{error:'INVALID_ANALYSIS',reference:'11111111-1111-4111-8111-111111111111'}}));
 await page.goto('/research?ticker=MSFT&lang=es');
 await page.getByRole('button',{name:'Generar informe',exact:true}).click();
 await expect(page.locator('[data-analysis]').getByRole('alert')).toContainText('repararlo automáticamente');
 await expect(page.locator('[data-analysis]').getByRole('alert')).toContainText('11111111-1111-4111-8111-111111111111');
 await expect(page.getByText('Análisis automático pendiente',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Descargar expediente/})).toBeVisible();
});
