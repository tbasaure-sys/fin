// Provider double for the existing three-section fixtures. The external reviewer
// is mocked; production reference resolution and publication checks remain real.
import {reviewReferences} from '../../lib/research/reference-review.mjs';
export function referenceProviderPayload(raw,dossier){
 if(!Array.isArray(raw?.reviews))return raw;
 const claims=dossier.sections.map(s=>({id:s.id,text:'Fixture claim.',chunkIds:[s.extracts[0].id]}));
 const packet=reviewReferences(claims,dossier);
 return {...raw,reviews:raw.reviews.map(r=>({id:r.id,verdict:r.verdict,
  unsupportedClause:r.verdict==='supported'?'':r.reason||'Unsupported.',
  supportIds:(r.support||[]).map(p=>packet.sources.find(s=>s.chunkId===p.chunkId)?.spans.find(s=>s.text.length>24)?.id||'missing'),
 }))};
}
