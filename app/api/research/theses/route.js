import {requireApiAuthSession} from '@/lib/server/auth/session';
import {verifyDossier} from '@/lib/server/filing-analysis';
import {createThesisStore,createMemoryThesisStore} from '@/lib/server/thesis-store';
import {createThesisService} from '@/lib/server/thesis-service';
import {createThesisHttp} from '@/lib/server/thesis-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const local=process.env.NODE_ENV!=='production'&&process.env.BLS_PRIME_STORAGE_BACKEND==='memory';
const store=local?createMemoryThesisStore():createThesisStore();
const handler=createThesisHttp({authenticate:requireApiAuthSession,service:createThesisService({store,verify:verifyDossier})});
export const GET=handler;
export const POST=handler;
