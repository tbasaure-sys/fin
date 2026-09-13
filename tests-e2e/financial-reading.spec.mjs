import {test,expect} from './filing-test-fixtures.mjs';
import {createRequire} from 'node:module';
import {financialReading} from '../lib/research/financial-reading.mjs';
import {interimFinancials} from '../lib/research/interim-financials.mjs';
const require=createRequire(import.meta.url);
const dossier=require('../lib/research/published/MSFT.json');
const source=dossier.sources.find(s=>s.form==='10-K');
function fixture({missingCapex=false,withInterim=false,withCapital=false}={}){
 const history=[2024,2025].map(year=>({end:`${year}-06-30`,facts:Object.fromEntries(Object.entries({revenue:120e6,ebit:24e6,cfo:year===2024?30e6:35e6,capex:year===2024?10e6:25e6,buybacks:12e6,dividends:6e6,sbc:year===2024?3e6:5e6,shares:11e6,netIncome:year===2024?16e6:18e6,da:year===2024?4e6:5e6,receivablesChange:year===2024?2e6:5e6,inventoryChange:year===2024?4e6:2e6,payablesChange:year===2024?1e6:4e6}).map(([key,value])=>[key,{
  value,unit:key==='shares'?'shares':'USD',start:`${year-1}-07-01`,end:`${year}-06-30`,availableAt:source.acceptedAt,accession:source.accession,concepts:[key],url:source.url,sourceHash:'a'.repeat(64),filingHash:source.sha256,
 }]))}));
 if(missingCapex)history[1].facts.capex=null;
 let interim=null;
 if(withInterim){
  const quarter={...source,form:'10-Q',accession:'interim-fixture',periodEnd:'2026-03-31',acceptedAt:'2026-08-01T00:00:00Z'};
  const concepts={cfo:'NetCashProvidedByUsedInOperatingActivities',capex:'PaymentsToAcquirePropertyPlantAndEquipment',revenue:'RevenueFromContractWithCustomerExcludingAssessedTax',ebit:'OperatingIncomeLoss'};
  const raw={facts:{'us-gaap':{}}};
  for(const [key,values] of Object.entries({cfo:[18e6,22e6],capex:[4e6,8e6],revenue:[60e6,70e6],ebit:[10e6,17e6]})){
   for(const year of history)if(year.facts[key])year.facts[key].concepts=[concepts[key]];
   raw.facts['us-gaap'][concepts[key]]={units:{USD:values.map((val,i)=>({val,form:'10-Q',accn:quarter.accession,start:`${2024+i}-07-01`,end:`${2025+i}-03-31`}))}};
  }
  if(withCapital)for(const [tag,values] of [
   ['NetCashProvidedByUsedInInvestingActivities',[-5e6,-10e6]],['NetCashProvidedByUsedInFinancingActivities',[-9e6,-11e6]],
   ['PaymentsForRepurchaseOfCommonStock',[5e6,7e6]],['PaymentsOfDividends',[2e6,3e6]],
   ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',[4e6,1e6]],
  ])raw.facts['us-gaap'][tag]={units:{USD:values.map((val,i)=>({val,form:'10-Q',accn:quarter.accession,start:`${2024+i}-07-01`,end:`${2025+i}-03-31`}))}};
  interim=interimFinancials({raw,dossier:{...dossier,sources:[...dossier.sources,quarter]},history,sourceHash:'a'.repeat(64)});
 }
 return {reading:financialReading({ticker:dossier.ticker,asOf:dossier.asOf,currency:'USD',identity:{supportedBusiness:true},history,interim}),packetHash:dossier.packetHash};
}
test.beforeEach(()=>test.skip(!process.env.BLS_E2E_AUTHENTICATED,'Requires authenticated local or QA context'));
test.beforeEach(async({page})=>{
 const goto=page.goto.bind(page);
 page.goto=async(...args)=>{const response=await goto(...args);await page.getByText('Cifras financieras y detalle de fuentes',{exact:true}).click();return response};
 await page.route('**/api/research/theses?ticker=*',r=>r.fulfill({json:{revisions:[]}}));
 await page.route('**/api/public/research?ticker=MSFT',r=>r.fulfill({json:{dossier,ticket:'test-ticket',analysisAvailable:false}}));
});
test('financial reading loads without AI and exposes the calculation and source',async({page})=>{
 let aiCalls=0,financialCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/public/research/analyze',r=>{aiCalls++;return r.abort()});
 await page.route('**/api/research/financial-reading',r=>{financialCalls++;expect(r.request().postDataJSON().ticket).toBe('test-ticket');return r.fulfill({json:fixture()})});
 await page.goto('/research?ticker=MSFT&lang=es');
 const panel=page.locator('[data-financial-reading]');
 await expect(panel.getByRole('heading',{name:'Lectura financiera',exact:true})).toBeVisible();
 await expect(panel.getByText('La inversión creció más que la caja operativa.',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Caja después de inversión · 2025-06-30'}).click();
 await expect(panel.getByRole('region',{name:'Detalle de la cifra'})).toContainText('35 − 25 = 10');
 await expect(panel.getByRole('region',{name:'Detalle de la cifra'}).getByRole('link').first()).toHaveAttribute('href',source.url);
 await expect(panel.getByText(/Millones de USD/).first()).toBeVisible();
 await page.getByRole('button',{name:'Documentos y lectura',exact:true}).click();
 await page.getByRole('button',{name:'Mi tesis',exact:true}).click();
 expect(aiCalls).toBe(0);expect(financialCalls).toBe(1);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cash reconciliation exposes the signed effect, unexplained difference and both source periods',async({page})=>{
 let aiCalls=0;
 await page.route('**/api/public/research/analyze',r=>{aiCalls++;return r.abort()});
 await page.route('**/api/research/financial-reading',r=>r.fulfill({json:fixture()}));
 await page.goto('/research?ticker=MSFT&lang=es');
 const bridge=page.locator('[data-cash-bridge]');
 await expect(bridge.getByRole('heading',{name:'Cómo cambió la caja'})).toBeVisible();
 await expect(bridge.locator('[data-bridge-row="receivablesChange"]')).toContainText('−3');
 await expect(bridge.locator('[data-bridge-row="unexplained"]')).toContainText('−2');
 await expect(bridge.locator('[data-bridge-row="cashAfterCapex"]')).toContainText('−10');
 await bridge.locator('[data-bridge-row="receivablesChange"] summary').click();
 await bridge.getByRole('button',{name:'Cuentas por cobrar · 2025-06-30'}).click();
 const detail=page.getByRole('region',{name:'Detalle de la cifra'});
 await expect(detail).toContainText('5');
 await expect(detail.getByRole('link').first()).toHaveAttribute('href',source.url);
 expect(aiCalls).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('financial source failure is recoverable without blocking the documents',async({page})=>{
 let calls=0;
 await page.route('**/api/research/financial-reading',r=>++calls===1?r.fulfill({status:503,json:{error:'FINANCIAL_SOURCE_UNAVAILABLE'}}):r.fulfill({json:fixture()}));
 await page.goto('/research?ticker=MSFT&lang=es');
 const panel=page.locator('[data-financial-reading]');
 await expect(panel.getByRole('alert')).toContainText('No pudimos recuperar las cifras');
 await page.getByRole('button',{name:'Documentos y lectura',exact:true}).click();
 await expect(page.getByText('Extractos seleccionados',{exact:false}).first()).toBeVisible();
 await panel.getByRole('button',{name:'Reintentar cifras'}).click();
 await expect(panel.getByRole('table').first()).toBeVisible();expect(calls).toBe(2);
});

test('latest cumulative results lead the annual history and expose every trailing calculation term',async({page})=>{
 await page.route('**/api/research/financial-reading',r=>r.fulfill({json:fixture({withInterim:true})}));
 await page.goto('/research?ticker=MSFT&lang=es');
 const recent=page.locator('[data-interim-reading]');
 await expect(recent.getByRole('heading',{name:'Desde el último cierre anual'})).toBeVisible();
 await expect(recent.getByText('2025-07-01 → 2026-03-31',{exact:true})).toBeVisible();
 await expect(recent.locator('[data-interim-metric="cfo"]')).toContainText('+4');
 await expect(recent.locator('[data-interim-metric="cashAfterCapex"]')).toContainText('14');
 await recent.getByText('Doce meses reconstruidos',{exact:true}).click();
 await recent.getByRole('button',{name:'Caja operativa · Doce meses'}).click();
 const detail=recent.getByRole('region',{name:'Cálculo y fuentes'});
 await expect(detail).toContainText('35 + 22 − 18 = 39');
 await expect(detail.getByRole('link')).toHaveCount(3);
 await expect(detail).toContainText('2025-04-01 → 2026-03-31');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await detail.getByRole('button',{name:'Cerrar detalle'}).click();
 await expect(detail).toHaveCount(0);
});

test('current capital allocation opens all four source terms without generating an AI claim',async({page})=>{
 let calls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/public/research/analyze',r=>{calls++;return r.abort()});
 await page.route('**/api/research/financial-reading',r=>r.fulfill({json:fixture({withInterim:true,withCapital:true})}));
 await page.goto('/research?ticker=MSFT&lang=es');
 const allocation=page.locator('[data-cash-allocation]');
 await expect(allocation.getByRole('heading',{name:'Caja y retornos al accionista'})).toBeVisible();
 await expect(allocation.locator('[data-allocation-metric="cashAfterDistributions"]')).toContainText('4');
 await expect(allocation.locator('[data-allocation-metric="otherCashMovements"]')).toContainText('−3');
 await expect(allocation.locator('[data-allocation-metric="cashChange"]')).toContainText('1');
 await allocation.getByRole('button',{name:'Saldo tras estas partidas · Actual'}).click();
 const detail=page.getByRole('region',{name:'Cálculo y fuentes'});
 await expect(detail).toContainText('22 − 8 − 7 − 3 = 4');
 await expect(detail.getByRole('link')).toHaveCount(4);
 await expect(detail).toContainText('Recompras de acciones comunes');
 await expect(allocation).toContainText('no identifica cómo se financió cada pago');
 expect(calls).toBe(0);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cash activity drilldown excludes payments already counted in the main bridge',async({page})=>{
 await page.route('**/api/research/financial-reading',r=>r.fulfill({json:fixture({withInterim:true,withCapital:true})}));
 await page.goto('/research?ticker=MSFT&lang=es');
 const allocation=page.locator('[data-cash-allocation]');
 await allocation.getByText('Desglosar otros movimientos',{exact:true}).click();
 const breakdown=allocation.locator('[data-activity-breakdown]');
 await expect(breakdown.locator('[data-activity-metric="otherInvesting"]')).toContainText('−2');
 await expect(breakdown.locator('[data-activity-metric="otherFinancing"]')).toContainText('−1');
 await expect(breakdown.locator('[data-activity-metric="unclassifiedCashChange"]')).toContainText('0');
 await breakdown.getByRole('button',{name:'Financiación restante · Actual'}).click();
 const detail=page.getByRole('region',{name:'Cálculo y fuentes'});
 await expect(detail).toContainText('(-11) + 7 + 3 = -1');
 await expect(detail.getByRole('link')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('missing facts and mismatched company packets are never shown as financial results',async({page})=>{
 let wrong=true;
 await page.route('**/api/research/financial-reading',r=>{
  const data=fixture({missingCapex:!wrong});if(wrong)data.reading.ticker='AAPL';
  return r.fulfill({json:data});
 });
 await page.goto('/research?ticker=MSFT&lang=es');const panel=page.locator('[data-financial-reading]');
 await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.getByRole('table')).toHaveCount(0);
 wrong=false;await panel.getByRole('button',{name:'Reintentar cifras'}).click();
 await expect(panel.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Inversión en activos físicos',exact:true})})).toContainText('Sin dato');
 await expect(panel.locator('[data-bridge-row="cashAfterCapex"]')).toHaveCount(0);
});
test('an expired session leads back to login, not a source retry loop',async({page})=>{
 await page.route('**/api/research/financial-reading',r=>r.fulfill({status:401,json:{error:'Authentication required.'}}));
 await page.goto('/research?ticker=MSFT&lang=es');const panel=page.locator('[data-financial-reading]');
 await expect(panel.getByRole('alert')).toContainText('Tu sesión expiró');
 await expect(panel.getByRole('link',{name:'Iniciar sesión'})).toHaveAttribute('href',/next=.*MSFT/);
 await expect(panel.getByRole('button',{name:'Reintentar cifras'})).toHaveCount(0);
});
