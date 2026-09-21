import {NextResponse} from 'next/server';
import {requireApiAuthSession} from '@/lib/server/auth/session';
import {loadCompanyFinancials} from '@/lib/server/company-financial-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request){
 const session=await requireApiAuthSession(request);if(session instanceof Response)return session;
 try{return NextResponse.json({company:await loadCompanyFinancials(new URL(request.url).searchParams.get('ticker'))},{headers:{'Cache-Control':'private, no-store'}})}
 catch(error){const code=['INVALID_TICKER','NO_ISSUER','BUSY'].includes(error.message)?error.message:'FINANCIAL_SOURCE_UNAVAILABLE';return NextResponse.json({error:code},{status:code==='INVALID_TICKER'?400:code==='NO_ISSUER'?404:code==='BUSY'?429:503,headers:{'Cache-Control':'private, no-store',...(code==='BUSY'?{'Retry-After':'10'}:{})}})}
}
