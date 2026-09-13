import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {evaluateCalibration} from '../lib/research/review-calibration.mjs';

test('actual AAPL reviewer failures stay reproducible, including the false claim with valid citations',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/review-aapl-observed-failure.json',import.meta.url),'utf8'));
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 assert.equal(hash(fixture.packet),fixture.packetHash,'do not simplify the observed multi-source context');
 const labels=fixture.packet.claims.map(c=>({id:c.id,caseKey:c.id,expected:fixture.expected[c.id],requiredSupport:fixture.requiredSupport[c.id]||[]}));
 const prepared={packet:fixture.packet,labels};
 assert.deepEqual(fixture.packet.claims.find(c=>c.id==='cash:1').chunkIds,['D4:350','D4:T184']);
 for(const trial of fixture.trials){
  assert.equal(hash(trial.raw),trial.responseHash);
  const result=evaluateCalibration(trial.raw,prepared);
  assert.equal(result.passed,false,'observed incorrect approvals must not become a successful calibration');
  assert.equal(result.qualityCertified,false);
  assert.equal(result.modelFalsePositives,trial.expectedModelFalsePositives);
  assert.equal(result.falsePositives,trial.expectedPipelineFalsePositives);
  assert.equal(result.blockedModelFalsePositives,trial.expectedBlockedModelFalsePositives);
 }
 const medium=evaluateCalibration(fixture.trials.find(t=>t.reasoning==='medium').raw,prepared);
 const bad=medium.observations.find(r=>r.id==='cash:1');
 assert.equal(bad.provenanceValid,true);
 assert.equal(bad.accepted,true,'this is the observed defect, not a certification that the statement is true');
 assert.equal(bad.expected,false);
});
