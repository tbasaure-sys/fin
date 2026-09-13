import {test,expect} from './filing-test-fixtures.mjs';
import {createRequire} from 'node:module';
const dossier=createRequire(import.meta.url)('../lib/research/published/MSFT.json');
test('financial preparation does not require authoring a thesis or inventing resolved evidence',async({page})=>{
 test.skip(!process.env.BLS_E2E_AUTHENTICATED,'Requires authenticated test context');
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'fixture',analysisAvailable:true}}));
 let saved;
 await page.route('**/api/research/theses**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{revisions:[]}});
  saved=r.request().postDataJSON();return r.fulfill({json:{revision:{hash:'a'.repeat(64),revision:1,branch:'base',thesis:saved.thesis,dossier,changes:{changed:[],recheck:[]},savedAt:new Date().toISOString()}}});
 });
 await page.route('**/api/research/capital**',r=>r.fulfill({json:{records:[]}}));
 await page.goto('/research?ticker=MSFT&lang=es');
 await expect(page.getByRole('button',{name:'Documentos y lectura',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Generar informe',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Mi tesis',exact:true}).click();await page.getByRole('button',{name:'Valoración y cartera',exact:true}).click();
 await page.getByRole('button',{name:'Preparar mi análisis de cifras'}).click();
 await expect(page.getByRole('button',{name:'Cargar cifras y conectar cartera'})).toBeVisible();
 expect(saved.thesis.explanation).toBe('');expect(saved.thesis.nodes.every(n=>n.statement===''&&n.evidence.length===0)).toBe(true);expect(saved.reason).toContain('sin resolver');
});
