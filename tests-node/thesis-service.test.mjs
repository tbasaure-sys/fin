import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newThesis} from '../lib/research/thesis-engine.mjs';
import {createThesisService} from '../lib/server/thesis-service.js';
import {createMemoryThesisStore} from '../lib/server/thesis-store.js';
const dossier=createRequire(import.meta.url)('../lib/research/published/MSFT.json');
const body=()=>({dossier,thesis:newThesis(dossier),branch:'base',expectedRevision:0,reason:'Initial investigation',changeKind:'interpretation',ticket:'valid'});
const setup=()=>createThesisService({store:createMemoryThesisStore(),verify:(d,t)=>t==='valid',clock:()=>new Date('2026-09-11T12:00:00Z')});

test('private revisions isolate owners, retain history, and reject concurrent stale writes',async()=>{
 const service=setup();const first=await service.save('alice',body());
 assert.equal(first.revision,1);assert.equal((await service.list('bob','MSFT')).length,0);
 const update={...body(),expectedRevision:1};update.thesis.explanation='Revised explanation';
 const results=await Promise.allSettled([service.save('alice',update),service.save('alice',update)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
 const history=await service.list('alice','MSFT');assert.equal(history.length,2);
 assert.equal(history.find(r=>r.revision===1).thesis.explanation,'');
});
test('scenario forks refer to a real owned parent without replacing the base',async()=>{
 const service=setup(),first=await service.save('alice',body());
 const fork={...body(),branch:'scenario-1',parentHash:first.hash};fork.thesis.name='Lower cash scenario';
 const scenario=await service.save('alice',fork);assert.equal(scenario.parentHash,first.hash);
 assert.equal((await service.list('alice','MSFT')).length,2);
 await assert.rejects(()=>service.save('bob',fork),/PARENT_NOT_FOUND/);
});
test('a signed original dossier can be reused after ticket expiry only from the same owned revision',async()=>{
 const service=setup(),first=await service.save('alice',body());
 const edit={...body(),ticket:'expired',expectedRevision:1,evidenceHash:first.evidenceHash};
 assert.equal((await service.save('alice',edit)).revision,2);
 await assert.rejects(()=>service.save('bob',{...edit,expectedRevision:0}),/DOSSIER_EXPIRED/);
 const forged=structuredClone(edit);forged.dossier.sources[0].sha256='f'.repeat(64);forged.expectedRevision=2;
 await assert.rejects(()=>service.save('alice',forged),/DOSSIER_EXPIRED/);
});
test('revision kinds never declare alpha or a new economic event based on an extraction repair',async()=>{
 const service=setup();const saved=await service.save('alice',{...body(),changeKind:'technical_correction'});
 assert.equal(saved.changeKind,'technical_correction');assert.equal(saved.assessment.predictiveClaim,false);
 assert.equal(saved.assessment.capital,'not_assessed');assert.equal(saved.economicNovelty,'unverified');
});
test('corrupted stored revisions are not rendered as trusted history',async()=>{
 const store=createMemoryThesisStore();const service=createThesisService({store,verify:()=>true});
 const first=await service.save('alice',body());first.thesis.explanation='Tampered text';
 store.list=async()=>[first];await assert.rejects(()=>service.list('alice','MSFT'),/CORRUPT_REVISION/);
});
