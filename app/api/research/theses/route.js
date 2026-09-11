import {requireApiAuthSession} from '@/lib/server/auth/session';
import {verifyDossier} from '@/lib/server/filing-analysis';
import {thesisRepository as store} from '@/lib/server/thesis-repository';
import {createThesisService} from '@/lib/server/thesis-service';
import {createThesisHttp} from '@/lib/server/thesis-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const handler=createThesisHttp({authenticate:requireApiAuthSession,service:createThesisService({store,verify:verifyDossier})});
export const GET=handler;
export const POST=handler;
