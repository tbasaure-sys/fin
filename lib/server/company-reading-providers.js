import 'server-only';
import { evidenceFromSec } from '../company-reading/sec-evidence.js';

function secAgent() {
  const configured = process.env.SEC_USER_AGENT || process.env.SEC_EDGAR_USER_AGENT || process.env.EDGAR_USER_AGENT || process.env.META_ALLOCATOR_SEC_USER_AGENT || process.env.BLS_PRIME_SEC_USER_AGENT;
  if (configured && /@/.test(configured)) return configured;
  const contact = process.env.SEC_CONTACT_EMAIL || process.env.EDGAR_CONTACT_EMAIL || process.env.BLS_PRIME_INVITE_CONTACT;
  return contact && /^[^\s@]+@[^\s@]+$/.test(contact) ? `BLSPrime research ${contact}` : null;
}
async function get(url, headers = {}, text = false) {
  const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Proveedor de evidencia no disponible.');
  return text ? response.text() : response.json();
}
let directory = null;
async function resolveSecTicker(ticker, headers) {
  if (!directory || Date.now() - directory.at > 86400000) directory = { at: Date.now(), data: await get('https://www.sec.gov/files/company_tickers.json', headers) };
  const issuer = Object.values(directory.data).find(r => r.ticker === ticker);
  if (!issuer) throw new Error('El ticker no está resuelto en SEC.');
  return String(issuer.cik_str).padStart(10, '0');
}
export function extractBusinessExcerpt(html) {
  const text = String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/&(?:quot|#34);/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff))).replace(/\s+/g, ' ');
  const starts = [...text.matchAll(/item\s*1\s*[.\-:]?\s*business\b/gi)];
  const excerpts = starts.map(m => { const tail = text.slice(m.index + m[0].length); const end = tail.search(/item\s*1a\s*[.\-:]?\s*risk\s*factors/gi); return end >= 0 ? tail.slice(0, end).trim() : ''; }).filter(s => s.length >= 500 && s.length <= 180000);
  return excerpts.sort((a, b) => b.length - a.length)[0]?.slice(0, 1800) || null;
}
async function yahooClose(ticker, cutoff, capturedAt) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d&events=splits`;
  const data = await get(url, { 'User-Agent': 'Mozilla/5.0' });
  const result = data.chart?.result?.[0], meta = result?.meta;
  if (!meta || meta.symbol !== ticker || meta.instrumentType !== 'EQUITY') return null;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const todayIncomplete = Number(meta.currentTradingPeriod?.regular?.end) * 1000 > Date.parse(capturedAt);
  const rows = (result.timestamp || []).map((timestamp, i) => ({ date: new Date(timestamp * 1000).toISOString().slice(0, 10), value: closes[i] })).filter(r => typeof r.value === 'number' && Number.isFinite(r.value) && r.date <= cutoff && !(todayIncomplete && r.date === capturedAt.slice(0, 10)));
  const last = rows.at(-1);
  if (!last) return null;
  return { value: last.value, label: 'Cierre observado', unit: meta.currency, currency: meta.currency, asOf: last.date, availableOn: last.date, adjustment: 'unadjusted', provenance: 'observed', exchange: meta.exchangeName, corporateActions: { from: rows[0]?.date, through: last.date, splits: Object.values(result.events?.splits || {}) }, sources: [{ id: 'yahoo:daily-close', provider: 'yahoo', label: 'Yahoo Finance · cierre diario sin ajustar', url, publishedAt: last.date, type: 'market' }] };
}
async function fmpClose(ticker, price) {
  const key = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY;
  if (!key || !price) return null;
  const publicUrl = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&from=${price.asOf}&to=${price.asOf}`;
  const data = await get(`${publicUrl}&apikey=${encodeURIComponent(key)}`);
  const rows = Array.isArray(data) ? data : data.historical;
  const row = rows?.find(r => r.date === price.asOf && r.symbol === ticker);
  if (typeof row?.close !== 'number') return null;
  // Currency must be corroborated by this provider rather than copied from Yahoo.
  const profiles = await get(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`);
  const profile = profiles?.find(r => r.symbol === ticker);
  if (!profile?.currency) return null;
  return { value: row.close, label: 'Segundo registro de cierre', currency: profile.currency, unit: profile.currency, asOf: row.date, availableOn: row.date, adjustment: 'unadjusted', provenance: 'observed', sources: [{ id: 'fmp:daily-close', provider: 'fmp', label: 'FMP · cierre diario sin ajustar', url: publicUrl, publishedAt: row.date, type: 'market-crosscheck' }] };
}
export async function loadSecReadingEvidence(ticker, { cutoff, capturedAt }) {
  const agent = secAgent();
  if (!agent) return { issues: [{ key: 'sec_access', message: 'La conexión SEC necesita un contacto configurado (SEC_USER_AGENT o SEC_CONTACT_EMAIL). No se fabrican estados financieros.' }] };
  const headers = { 'User-Agent': agent, Accept: 'application/json' };
  const cik = await resolveSecTicker(ticker, headers);
  // Only three SEC calls, followed by the source filing. No per-concept fanout.
  const [companyFacts, submissions, price] = await Promise.all([get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, headers), get(`https://data.sec.gov/submissions/CIK${cik}.json`, headers), yahooClose(ticker, cutoff, capturedAt).catch(() => null)]);
  const quotes = price ? { price } : {};
  const crosscheck = await fmpClose(ticker, price).catch(() => null);
  if (crosscheck) quotes.priceCrosscheck = crosscheck;
  let evidence = evidenceFromSec({ ticker, companyFacts, submissions, cutoff, quotes });
  if (evidence.business?.filingUrl) {
    const html = await get(evidence.business.filingUrl, headers, true).catch(() => null);
    evidence = evidenceFromSec({ ticker, companyFacts, submissions, cutoff, quotes, businessExcerpt: html ? extractBusinessExcerpt(html) : null });
  }
  const balanceEnd = evidence.facts.revenue.asOf;
  if (balanceEnd && price?.corporateActions?.from <= balanceEnd && submissions.tickers?.length === 1) {
    const factors = price.corporateActions.splits.filter(s => { const day = new Date(s.date * 1000).toISOString().slice(0, 10); return day > balanceEnd && day <= price.asOf; }).map(s => Number(s.numerator) / Number(s.denominator));
    evidence.shareBasis = { shareClass: 'common', splitCheckedThrough: price.asOf, splitFactorSinceBalance: factors.reduce((total, factor) => total * factor, 1), sources: price.sources, disclosure: 'Clase común de un emisor con un solo ticker resuelto. Eventos de splits consultados entre cierre fiscal y precio.' };
  }
  return evidence;
}
