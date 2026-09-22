import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarWindow,classifyMilestone,gateThesisReview} from '../lib/research/thesis-evidence.mjs';
import {questionsFor} from '../lib/research/jev.mjs';
const cutoff='2026-09-22T04:00:00Z';
test('past dividend approvals cannot be upcoming catalysts; fiscal years stay ambiguous',()=>{
 assert.equal(classifyMilestone('April 2025',['The board approved a dividend in April 2025.'],cutoff).status,'historical');
 assert.equal(classifyMilestone('2025',['Warehouses opened during 2025.'],cutoff).status,'historical');
 assert.equal(classifyMilestone('2026',['Plan for FY2026.'],cutoff).status,'undated');
 assert.equal(classifyMilestone('FY2026',['Plan for FY2026.'],cutoff).status,'undated');
 assert.equal(classifyMilestone('2027',['Plan for fiscal year 2027.'],cutoff).status,'undated');
 assert.equal(classifyMilestone('2026',['The project is expected in 2026.'],cutoff).status,'undated');
 assert.equal(classifyMilestone('December 31, 2026',['Scheduled for December 31, 2026.'],cutoff).status,'upcoming');
 assert.equal(classifyMilestone('December 31, 2027',['Scheduled for December 31, 2026.'],cutoff).status,'undated');
 assert.equal(calendarWindow('2026-02-30'),null);assert.equal(calendarWindow('2026-01-00'),null);
});
const answer=(choice,uncertain=false)=>({choice,uncertain});
function reviewed(timing,answers){return gateThesisReview({sections:[{id:'catalysts',findings:[{timing}]}]},{items:[{id:'catalysts:0',answers}]}).sections[0].findings[0]}
test('upcoming classification needs both a dated source and a clear temporal review',()=>{
 const answers={relation:answer('supports'),reasoning:answer('bounded'),timing:answer('upcoming')};
 assert.equal(reviewed({status:'historical'},answers).timing.status,'historical');
 assert.equal(reviewed({status:'undated'},answers).timing.status,'undated');
 assert.equal(reviewed({status:'upcoming'},answers).timing.status,'upcoming');
 assert.equal(reviewed({status:'upcoming'},{...answers,timing:answer('upcoming',true)}).timing.status,'undated');
 assert.equal(reviewed({status:'upcoming'},{}).timing.status,'undated');
 assert.equal(reviewed({status:'undated'},{...answers,timing:answer('historical')}).timing.status,'historical');
});
test('factual premise and conditional reasoning retain separate outcomes without lowering uncertainty',()=>{
 const finding=reviewed({status:'undated'},{relation:answer('supports'),reasoning:answer('overreach')});
 assert.equal(finding.premiseStatus,'supports');assert.equal(finding.reasoningStatus,'overreach');assert.equal(finding.reviewState,'challenged');
 assert.equal(reviewed({status:'undated'},{relation:answer('supports',true),reasoning:answer('bounded')}).reviewState,'unresolved');
 assert.match(questionsFor('investment_thesis',0).relation.instructions,/ONLY the premise/);
 assert.match(questionsFor('investment_thesis',0).timing.instructions,/asOf/);
});
