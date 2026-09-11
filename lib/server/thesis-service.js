import 'server-only';
import {hash} from '../research/filing-engine.mjs';
import {validateThesis,evaluateThesis,compareTheses,CHANGE_KINDS} from '../research/thesis-engine.mjs';

export function createThesisService({store,verify,clock=()=>new Date()}) {
  function checked(record){if(!record)return null;const {hash:checksum,...content}=record;if(hash(content)!==checksum||hash(record.dossier)!==record.evidenceHash)throw Error('CORRUPT_REVISION');return record}
  return {
    list:async(owner,ticker)=>(await store.list(owner,ticker)).map(checked),
    async save(owner,body){
      const {dossier,ticket,branch,expectedRevision,reason,changeKind,parentHash=null}=body||{};
      if(!owner||!dossier||!/^[a-zA-Z0-9-]{1,64}$/.test(branch)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||typeof reason!=='string'||!reason.trim()||reason.length>1000||!CHANGE_KINDS.includes(changeKind))throw Error('INVALID_THESIS');
      const thesis=validateThesis(body.thesis,dossier);
      const previous=checked(await store.latest(owner,thesis.companyKey,branch));
      if((previous?.revision||0)!==expectedRevision)throw Error('REVISION_CONFLICT');
      let parent=previous;
      if(!previous&&branch!=='base'){
        parent=checked(await store.findHash(owner,parentHash));
        if(!parent||parent.thesis.companyKey!==thesis.companyKey)throw Error('PARENT_NOT_FOUND');
      }
      const evidenceHash=hash(dossier);
      if(!verify(dossier,ticket)&&!(parent&&parent.evidenceHash===evidenceHash))throw Error('DOSSIER_EXPIRED');
      const savedAt=clock().toISOString();
      const record={version:'bls-thesis-revision-v1',branch,revision:expectedRevision+1,parentHash:parent?.hash||null,
        thesis,dossier:structuredClone(dossier),evidenceHash,savedAt,reason:reason.trim(),changeKind,economicNovelty:'unverified',
        changes:compareTheses(parent?.thesis,thesis),assessment:evaluateThesis(thesis,savedAt)};
      record.hash=hash(record);
      return store.append(owner,record,expectedRevision);
    },
  };
}
