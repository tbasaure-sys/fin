import test from 'node:test';import assert from 'node:assert/strict';
import {briefInput} from './fixtures/economic-brief-input.mjs';
import * as engine from '../lib/research/thesis-engine.mjs';
test('a research question only populates an empty question on the same pinned dossier',()=>{
 assert.equal(typeof engine.researchQuestionProposal,'function');
 const {dossier}=briefInput(),thesis=engine.newThesis(dossier),prompt={nodeId:'business',question:'What supports hardware growth?',test:'Compare the reported product lines.',dossier};
 thesis.nodes[0].statement='My existing view';const before=JSON.stringify(thesis);
 const proposal=engine.researchQuestionProposal(thesis,prompt,dossier);
 assert.deepEqual(proposal,{nodeId:'business',question:prompt.question,test:prompt.test});assert.equal(JSON.stringify(thesis),before);
 const updated={...thesis,nodes:thesis.nodes.map(n=>n.id==='business'?{...n,question:proposal.question,test:proposal.test}:n)};
 assert.equal(engine.validateThesis(updated,dossier).nodes[0].statement,'My existing view');
 assert.equal(engine.researchQuestionProposal(updated,prompt,dossier),null);
 for(const patch of [{nodeId:'invented'},{question:''},{dossier:{...dossier,ticker:'OTHER'}},{dossier:{...dossier,asOf:'2026-08-03T00:00:00Z'}},{dossier:{...dossier,sources:[]}}])
  assert.equal(engine.researchQuestionProposal(thesis,{...prompt,...patch},dossier),null);
});
