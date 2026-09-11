import { createAnalysisHandler } from '../../../../../lib/server/filing-analysis.js';
import { consumePublicRateLimit } from '../../../../../lib/server/data/public-rate-limit.js';
import {createReportStore} from '../../../../../lib/server/filing-report-cache.js';
import {requireApiAuthSession} from '../../../../../lib/server/auth/session.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const analyze=createAnalysisHandler({consume:consumePublicRateLimit,store:createReportStore()});
export async function POST(request) {
  const session=await requireApiAuthSession(request);
  if(session instanceof Response)return session;
  return analyze(request);
}
