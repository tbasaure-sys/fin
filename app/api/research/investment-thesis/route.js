import {createAnalysisHandler} from '@/lib/server/filing-analysis';
import {generateInvestmentThesis,THESIS_VERSION} from '@/lib/server/investment-thesis';
import {consumePublicRateLimit} from '@/lib/server/data/public-rate-limit';
import {createReportStore} from '@/lib/server/filing-report-cache';
import {requireApiAuthSession} from '@/lib/server/auth/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=90;
const generate=createAnalysisHandler({consume:consumePublicRateLimit,store:createReportStore(),generate:generateInvestmentThesis,version:THESIS_VERSION});
export async function POST(request){const session=await requireApiAuthSession(request);if(session instanceof Response)return session;return generate(request)}
