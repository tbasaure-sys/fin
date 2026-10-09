'use client';
import { useState } from 'react';
import { configureResearchHypotheses } from '@/lib/company-reading/research-snapshot';
import { buildCompanyReading, readingValue } from '@/lib/company-reading/engine';
import styles from './company-thesis-workspace.module.css';

export default function CompanyThesisHypotheses({ snapshot, onConfigure }) {
  const definitions = snapshot.assumptionDefinitions;
  const [draft, setDraft] = useState(() => ({ central: Object.fromEntries(Object.entries(definitions).map(([key, d]) => [key, d.value === null ? '' : d.value * 100])), adverse: Object.fromEntries(Object.keys(definitions).map(key => [key, snapshot.scenarios?.adverse?.[key] === undefined ? '' : snapshot.scenarios.adverse[key] * 100])), favorable: Object.fromEntries(Object.keys(definitions).map(key => [key, snapshot.scenarios?.favorable?.[key] === undefined ? '' : snapshot.scenarios.favorable[key] * 100])), rationale: snapshot.assumptionSource.rationale || '' }));
  const [error, setError] = useState('');
  function update(name, key, value) { setDraft(prior => ({ ...prior, [name]: { ...prior[name], [key]: value } })); }
  function apply(event) {
    event.preventDefault(); setError('');
    try {
      if (draft.rationale.trim().length < 20) throw new Error('Explica el fundamento de las hipótesis y qué evidencia podría refutarlas (al menos 20 caracteres).');
      const policy = { rationale: draft.rationale };
      for (const name of ['central', 'adverse', 'favorable']) policy[name] = Object.fromEntries(Object.keys(definitions).map(k => [k, draft[name][k] === '' || draft[name][k] === undefined ? null : Number(draft[name][k]) / 100]));
      const configured = configureResearchHypotheses(snapshot, policy);
      const result = buildCompanyReading(configured);
      if (result.status === 'research' && !(result.adverse.value.value < result.valuation.central.value && result.favorable.value.value > result.valuation.central.value)) throw new Error('El adverso debe producir un valor menor que el central y el favorable uno mayor. Revisa los escenarios.');
      onConfigure(configured, policy);
    } catch (e) { setError(e.message); }
  }
  return <details className={styles.hypothesisSetup} open>
    <summary>Declarar hipótesis para esta empresa</summary>
    <p>Los motores no completan supuestos faltantes. Introduce porcentajes para los tres escenarios y deja registrado su fundamento. Estos valores son hipótesis del investigador.</p>
    <p>Referencia observada: margen operativo {typeof snapshot.facts.operatingIncome.value === 'number' && snapshot.facts.revenue.value > 0 ? readingValue({ value: snapshot.facts.operatingIncome.value / snapshot.facts.revenue.value, unit: 'percent' }) : 'No disponible'} · período {snapshot.facts.revenue.asOf || 'faltante'} · {snapshot.facts.operatingIncome.sources?.[0]?.label || 'sin fuente'}. No implica que ese margen sea sostenible.</p>
    <form onSubmit={apply}>
      <div className={styles.hypothesisGrid}><div className={styles.hypothesisHead}><span>Hipótesis (%)</span><span>Central</span><span>Adverso</span><span>Favorable</span></div>
        {Object.entries(definitions).map(([key, d]) => <div key={key} className={styles.hypothesisRow}><span>{d.label}</span>{['central', 'adverse', 'favorable'].map(name => <input key={name} type="number" aria-label={`${d.label} · ${name}`} min={d.min * 100} max={d.max * 100} step="any" value={draft[name][key] ?? ''} onChange={e => update(name, key, e.target.value)} required />)}</div>)}
      </div>
      <label className={styles.rationale}>Fundamento y evidencia que lo refutaría<textarea value={draft.rationale} onChange={e => setDraft(prior => ({ ...prior, rationale: e.target.value }))} maxLength={1200} required /></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button type="submit">Aplicar hipótesis y recalcular</button>
    </form>
  </details>;
}
