import "server-only";
import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { createReportStore, reportKey, readRecord } from "./filing-report-cache.js";
import { verifyDossier } from "./filing-analysis.js";
import { THESIS_VERSION } from "./investment-thesis.js";
import { loadFilingDossier } from "./filing-dossier-service.js";
import { jevService } from "./jev-service.js";
import { hash } from "../research/filing-engine.mjs";
import { candidateClaims, eventKey, evidenceStatus, newSources } from "../research/living-case.mjs";

const error = (code) => Object.assign(new Error(code), { code });

export function createLivingCaseService({ getSql = getNeonSql, reportStore = createReportStore(), loadDossier = loadFilingDossier, jev = jevService, clock = () => new Date(), storageAvailable = usingNeonStorage, verifyTicket = verifyDossier } = {}) {
  async function database(session) {
    if (!storageAvailable()) throw error("STORAGE_UNAVAILABLE");
    const owner = session?.user?.id, workspace = session?.workspace?.id;
    if (!owner || !workspace) throw error("AUTH_REQUIRED");
    const sql = getSql();
    const rows = await sql.query("SELECT id FROM bls_workspaces WHERE id=$1 AND owner_user_id=$2 LIMIT 1", [workspace, owner]);
    if (!rows.length) throw error("ACCESS_DENIED");
    return { sql, owner, workspace };
  }

  async function list(session) {
    const { sql, owner, workspace } = await database(session);
    const [cases, events] = await Promise.all([
      sql.query(`SELECT ticker, baseline, created_at, last_checked_at FROM bls_living_cases_v1
        WHERE owner_id=$1 AND workspace_id=$2 ORDER BY updated_at DESC LIMIT 20`, [owner, workspace]),
      sql.query(`SELECT ticker, payload, created_at FROM bls_living_case_events_v1
        WHERE owner_id=$1 AND workspace_id=$2 ORDER BY created_at DESC LIMIT 100`, [owner, workspace]),
    ]);
    return {
      status: "available",
      cases: cases.map((row) => ({
        ticker: row.ticker,
        baselineAsOf: row.baseline?.asOf || null,
        sourceCount: row.baseline?.sources?.length || 0,
        baselineSections: (row.baseline?.sections || []).map((section) => ({
          id: section.id,
          findings: (section.findings || []).map((finding) => ({ premise: finding.premise, text: finding.text })),
          checks: section.checks || [],
        })),
        followedAt: row.created_at,
        lastCheckedAt: row.last_checked_at,
      })),
      events: events.map((row) => ({ ...row.payload, ticker: row.ticker, createdAt: row.created_at })),
    };
  }

  async function follow(session, { dossier, ticket, language = "es" }) {
    const { sql, owner, workspace } = await database(session);
    if (!dossier || typeof dossier !== "object" || !['es', 'en'].includes(language) || !verifyTicket(dossier, ticket)) throw error("INVALID_DOSSIER");
    const ticker = dossier.ticker;
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker || "")) throw error("INVALID_TICKER");
    const key = reportKey(dossier, language, THESIS_VERSION);
    const record = readRecord(await reportStore.get(key), dossier, language, THESIS_VERSION);
    if (!record || record.analysis?.status !== "draft") throw error("GENERATE_THESIS_FIRST");
    const baseline = {
      version: record.analysis.version,
      language,
      asOf: record.dossier.asOf,
      sources: record.dossier.sources.map(({ id, accession, form, acceptedAt, url, sha256 }) => ({ id, accession, form, acceptedAt, url, sha256 })),
      sections: record.analysis.sections,
    };
    const baselineKey = hash(baseline);
    if (JSON.stringify(baseline).length > 180000) throw error("CASE_TOO_LARGE");
    const inserted = await sql.query(`INSERT INTO bls_living_cases_v1
      (workspace_id, owner_id, ticker, language, baseline_key, baseline)
      SELECT $1,$2,$3,$4,$5,$6::jsonb
      WHERE (SELECT COUNT(*) FROM bls_living_cases_v1 WHERE workspace_id=$1 AND owner_id=$2) < 12
      ON CONFLICT (workspace_id, ticker) DO NOTHING RETURNING ticker`,
      [workspace, owner, ticker, language, baselineKey, JSON.stringify(baseline)]);
    if (!inserted.length) {
      const existing = await sql.query(`SELECT ticker FROM bls_living_cases_v1
        WHERE workspace_id=$1 AND owner_id=$2 AND ticker=$3`, [workspace, owner, ticker]);
      if (!existing.length) throw error("CASE_LIMIT");
    }
    return { status: "following", ticker, alreadyFollowing: !inserted.length };
  }

  async function refresh(session, ticker) {
    const { sql, owner, workspace } = await database(session);
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker || "")) throw error("INVALID_TICKER");
    const rows = await sql.query(`SELECT baseline, baseline_key, last_checked_at FROM bls_living_cases_v1
      WHERE workspace_id=$1 AND owner_id=$2 AND ticker=$3 LIMIT 1`, [workspace, owner, ticker]);
    const row = rows[0];
    if (!row) throw error("CASE_NOT_FOUND");
    const now = clock();
    if (row.last_checked_at && now.getTime() - new Date(row.last_checked_at).getTime() < 3600000) {
      return { status: "recently_checked", ticker, checkedAt: row.last_checked_at, newSources: 0 };
    }
    const dossier = await loadDossier(ticker);
    if (dossier.ticker !== ticker) throw error("ISSUER_MISMATCH");
    const pending = newSources(row.baseline, dossier).sort((a, b) => Date.parse(a.acceptedAt) - Date.parse(b.acceptedAt));
    const prior = await sql.query(`SELECT DISTINCT source_accession FROM bls_living_case_events_v1
      WHERE workspace_id=$1 AND owner_id=$2 AND ticker=$3`, [workspace, owner, ticker]);
    const seen = new Set(prior.map((item) => item.source_accession));
    const sources = pending.filter((source) => !seen.has(source.accession)).slice(0, 4);
    let created = 0;
    for (const source of sources) {
      const candidates = candidateClaims(row.baseline, dossier, source);
      let review = null;
      if (candidates.length) {
        const items = candidates.map((claim) => ({
          id: claim.id, ticker, section: claim.section, kind: claim.kind,
          premise: claim.premise, statement: claim.statement,
          asOf: dossier.asOf, eventDate: "",
          evidence: [{ id: claim.excerpt.id, text: claim.excerpt.text.slice(0, 1200), context: claim.excerpt.text.slice(0, 1600), contextPartial: claim.excerpt.text.length > 1600 }],
        }));
        try { review = await jev.evaluate("investment_thesis", items); } catch { /* Explicitly unresolved below. */ }
      }
      const events = [{
        key: eventKey(workspace, ticker, row.baseline_key, source.accession, "document"),
        source, kind: "new_document", reviewStatus: "needs_review", claim: null, excerpt: null,
      }, ...candidates.map((claim) => ({
        key: eventKey(workspace, ticker, row.baseline_key, source.accession, claim.id),
        source, kind: "claim_review", reviewStatus: evidenceStatus(review?.items?.find((item) => item.id === claim.id)),
        claim: { id: claim.id, section: claim.section, premise: claim.premise },
        excerpt: claim.excerpt.text.slice(0, 700),
      }))];
      for (const event of events) {
        const payload = {
          kind: event.kind, source: { form: source.form, accession: source.accession, acceptedAt: source.acceptedAt, url: source.url },
          reviewStatus: event.reviewStatus, claim: event.claim, excerpt: event.excerpt,
          coverage: "selected_filing_excerpts_only",
        };
        const inserted = await sql.query(`INSERT INTO bls_living_case_events_v1
          (event_key, workspace_id, owner_id, ticker, source_accession, source_accepted_at, payload)
          VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb) ON CONFLICT DO NOTHING RETURNING event_key`,
          [event.key, workspace, owner, ticker, source.accession, source.acceptedAt, JSON.stringify(payload)]);
        created += inserted.length;
      }
    }
    await sql.query(`UPDATE bls_living_cases_v1 SET last_checked_at=$4::timestamptz, updated_at=NOW()
      WHERE workspace_id=$1 AND owner_id=$2 AND ticker=$3`, [workspace, owner, ticker, now.toISOString()]);
    return { status: "checked", ticker, checkedAt: now.toISOString(), newSources: sources.length, newEvents: created,
      morePending: pending.filter((source) => !seen.has(source.accession)).length > sources.length };
  }

  return { list, follow, refresh };
}

export const livingCaseService = createLivingCaseService();
