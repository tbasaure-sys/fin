import { buildCompanyReading } from '@/lib/company-reading/engine';
import { getCompanyReadingSnapshot } from '@/lib/company-reading/snapshots';
import { configureResearchHypotheses } from '@/lib/company-reading/research-snapshot';
import { companyThesisContext } from '@/lib/server/company-reading-context';
import { captureCompanyReading } from '@/lib/server/company-reading-service';
import { hasSameRequestOrigin } from '@/lib/company-reading/request-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const context = params => companyThesisContext(String(params.ticker || '').toUpperCase());
function respond(payload, status = 200) { return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } }); }
function errorResponse(error) { return respond({ ok: false, error: error.status ? error.message : 'No se pudo leer o guardar el registro. Las versiones anteriores no se modificaron.' }, error.status || 500); }
export async function GET(_request, { params }) {
  try { const { owner, ticker, scope, store } = await context(params); return respond({ ok: true, scope, ledger: await store.read(owner, ticker) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request, { params }) {
  try {
    if (!hasSameRequestOrigin(request)) return respond({ ok: false, error: 'Origen de solicitud inválido.' }, 403);
    const raw = await request.text();
    if (raw.length > 8000) return respond({ ok: false, error: 'Solicitud demasiado grande.' }, 413);
    let body; try { body = JSON.parse(raw); } catch { return respond({ ok: false, error: 'JSON inválido.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ ok: false, error: 'Solicitud inválida.' }, 400);
    const { owner, ticker, scope, snapshots, store } = await context(params);
    let ledger;
    if (body.action === 'commit') {
      let reading;
      let snapshot;
      try {
        snapshot = body.snapshotId?.startsWith('snapshot-') ? await snapshots.get(body.snapshotId, ticker) : getCompanyReadingSnapshot(ticker, { missingDebt: body.case === 'missing-debt' });
        if (snapshot.schema === 'company_reading_snapshot_v2' && body.policy) snapshot = configureResearchHypotheses(snapshot, body.policy);
        reading = buildCompanyReading(snapshot, body.assumptions || {}, { weight: body.weight ?? .1 });
        if (body.runId && body.runId !== reading.runId) return respond({ ok: false, error: 'El cálculo no coincide con la lectura visible. Recarga antes de guardar.' }, 409);
      }
      catch (error) { return respond({ ok: false, error: error.message }, 400); }
      // Recompute server-side. Client numerical results and narration are never accepted.
      ledger = await store.commit({ owner, ticker, expectedVersion: body.expectedVersion, reading, snapshot });
    } else if (body.action === 'evidence') {
      const current = await store.read(owner, ticker);
      const thesis = current.events.find(e => e.version === body.thesisVersion && e.type === 'thesis');
      if (!thesis) return respond({ ok: false, error: 'Selecciona una tesis existente.' }, 400);
      let evidence;
      if (thesis.payload.reading.mode !== 'historical_reconstruction') {
        const snapshot = await captureCompanyReading(ticker, { store: snapshots });
        const asOf = snapshot.facts.revenue.asOf, availableOn = snapshot.facts.revenue.availableOn;
        if (!asOf || asOf <= thesis.payload.reading.cutoff || !availableOn || availableOn <= thesis.payload.reading.cutoff) return respond({ ok: false, error: 'Aún no hay un cierre anual posterior al corte de esta tesis. Las expectativas permanecen intactas.' }, 422);
        const facts = Object.fromEntries(['revenue', 'operatingIncome', 'cfo', 'capex'].filter(k => typeof snapshot.facts[k]?.value === 'number').map(k => [k, snapshot.facts[k]]));
        evidence = { id: snapshot.id, ticker, asOf, availableOn, facts, sources: snapshot.facts.revenue.sources };
      }
      ledger = await store.evidence({ owner, ticker, expectedVersion: body.expectedVersion, thesisVersion: body.thesisVersion, evidence });
    } else return respond({ ok: false, error: 'Acción no admitida.' }, 400);
    return respond({ ok: true, scope, ledger }, 201);
  } catch (error) { return errorResponse(error); }
}
