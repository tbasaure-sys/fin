import {requireApiAuthSession} from '@/lib/server/auth/session';
import {createFinancialLoader} from '@/lib/server/thesis-financials';
import {createFinancialReadingHandler} from '@/lib/server/financial-reading-service';
import {consumePublicRateLimit} from '@/lib/server/data/public-rate-limit';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// No model, market API, private holdings read or database mutation in this loader.
const handler=createFinancialReadingHandler({authenticate:requireApiAuthSession,load:createFinancialLoader({includeQuote:false}),consume:consumePublicRateLimit});
export const POST=handler;
