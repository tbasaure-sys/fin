import {createRequire} from 'node:module';
import {dossier as apple,cases as appleCases} from './aapl-claim-review-controls.mjs';
import {bindControls} from './reviewer-controls.mjs';
import {hash} from '../../lib/research/filing-engine.mjs';
const msft=createRequire(import.meta.url)('../../lib/research/published/MSFT.json');
const groups=[{dossier:apple,cases:appleCases},bindControls(msft)];
export const dossier={packets:groups.map(g=>({ticker:g.dossier.ticker,asOf:g.dossier.asOf,hash:hash(g.dossier)})),
 sources:groups.flatMap(g=>g.dossier.sources.map(s=>({...s,id:`${g.dossier.ticker}:${s.id}`,ticker:g.dossier.ticker}))),
 sections:[{extracts:groups.flatMap(g=>{
  const used=new Set(g.cases.flatMap(c=>c.chunkIds??[c.chunkId]));
  return g.dossier.sections.flatMap(s=>s.extracts).filter(e=>used.has(e.id)).map(e=>({...e,id:`${g.dossier.ticker}:${e.id}`}));
 })}]};
export const cases=groups.flatMap(g=>g.cases.map(c=>({...c,id:`${g.dossier.ticker}:${c.id}`,
 chunkIds:(c.chunkIds??[c.chunkId]).map(id=>`${g.dossier.ticker}:${id}`)})));
