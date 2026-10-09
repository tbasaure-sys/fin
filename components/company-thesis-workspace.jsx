'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCompanyReading, readingValue } from '@/lib/company-reading/engine';
import { READING_ASSUMPTIONS } from '@/lib/company-reading/snapshots';
import CompanyThesisHypotheses from './company-thesis-hypotheses';
import CompanyThesisUnderstanding from './company-thesis-understanding';
import readingMediaManifest from '@/public/media/msft-reading-v1.json';
import styles from './company-thesis-workspace.module.css';

const STEPS = ['Negocio', 'Economía disponible', 'Precio y expectativas', 'Rango de valoración', 'Intentar refutar', 'Escenario adverso', 'Efecto en cartera'];
const money = (value, currency = 'USD') => readingValue({ value, unit: `${currency}/share`, currency });
const pct = value => readingValue({ value, unit: 'percent' });
const dateTime = value => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value));

function Provenance({ point }) {
  return <details className={styles.provenance}>
    <summary>{point.value === null ? 'Dato faltante' : `${point.asOf || 'Fecha faltante'} · ${point.provenance === 'calculated' ? 'Cálculo' : point.provenance === 'assumption' ? 'Hipótesis' : 'Observado'} · ${point.sources?.[0]?.label || 'Sin fuente'}`}</summary>
    {point.availableOn && <p>Disponible desde {point.availableOn}.</p>}
    {point.reason && <p>{point.reason}</p>}
    {point.formula && <p>{point.formula}</p>}
    {point.sources?.map(source => <p key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : source.label} · publicado {source.publishedAt || 'sin fecha'}</p>)}
    {point.hypothesisRefs?.length > 0 && <ul>{point.hypothesisRefs.map(ref => <li key={ref.key}>{ref.key}: {pct(ref.value)} · {ref.asOf} · {ref.basis} · {ref.formula}{ref.sources?.map(s => <span key={s.id}> · {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a> : s.label} · {s.publishedAt}</span>)}</li>)}</ul>}
    {point.inputRefs?.length > 0 && <ul>{point.inputRefs.map((ref, i) => <li key={i}>{typeof ref === 'string' ? ref : `${ref.key} · período ${ref.asOf || 'faltante'} · disponible ${ref.availableOn || 'faltante'}`}</li>)}</ul>}
  </details>;
}
function Figure({ point, label, large = false }) {
  if (!point) return null;
  return <div className={`${styles.figure} ${large ? styles.largeFigure : ''}`}>
    <span>{label || point.label}</span><strong>{readingValue(point)}</strong><Provenance point={point} />
  </div>;
}
function Section({ index, title, hint, children }) {
  return <section className={styles.section} id={`reading-${index}`} aria-labelledby={`title-${index}`}>
    <header><span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span><div><h2 id={`title-${index}`}>{title}</h2>{hint && <p>{hint}</p>}</div></header>{children}
  </section>;
}
function RangeChart({ reading }) {
  const money = value => readingValue({ value, unit: `${reading.currency}/share`, currency: reading.currency });
  const { low, central, high } = reading.valuation;
  const price = reading.facts.price.value;
  const min = Math.min(low.value, price, central.value), max = Math.max(high.value, price, central.value);
  const spread = Math.max(max - min, 1);
  const x = v => 45 + ((v - min) / spread) * 600;
  return <figure className={styles.rangeChart}>
    <svg viewBox="0 0 690 115" role="img" aria-label={`Intervalo de ${money(low.value)} a ${money(high.value)}. Central ${money(central.value)}. Cierre ${money(price)}.`}>
      <line x1="45" x2="645" y1="70" y2="70" stroke="#36404d" strokeWidth="2" />
      <line x1={x(low.value)} x2={x(high.value)} y1="70" y2="70" stroke="#d5b477" strokeWidth="12" strokeLinecap="round" opacity=".6" />
      <circle cx={x(central.value)} cy="70" r="8" fill="#e8cd9d" stroke="#0b1119" strokeWidth="2" />
      <line x1={x(price)} x2={x(price)} y1="37" y2="87" stroke="#ebeff6" strokeWidth="2" strokeDasharray="4 3" />
      <text x={x(price)} y="23" textAnchor={x(price) > 555 ? 'end' : x(price) < 120 ? 'start' : 'middle'} fill="#ebeff6" fontSize="14">Cierre {money(price)}</text>
      <text x={x(low.value)} y="109" textAnchor="start" fill="#b6c2cf" fontSize="12">Adverso / inferior</text><text x={x(high.value)} y="109" textAnchor="end" fill="#b6c2cf" fontSize="12">Superior / favorable</text>
    </svg>
    <figcaption>Marcadores proporcionales al valor. Intervalo de escenarios, sin probabilidades asignadas.</figcaption>
  </figure>;
}

function SnapshotPlayer({ reading }) {
  const [open, setOpen] = useState(false), [chapter, setChapter] = useState(0), [playing, setPlaying] = useState(false), [voiceMessage, setVoiceMessage] = useState('');
  const token = useRef(0), timer = useRef(null), voiceUsed = useRef(false);
  const current = reading.narration.chapters[Math.min(chapter, reading.narration.chapters.length - 1)];
  function stop() { token.current++; clearTimeout(timer.current); if (voiceUsed.current && window.speechSynthesis) window.speechSynthesis.cancel(); voiceUsed.current = false; setPlaying(false); }
  useEffect(() => { token.current++; clearTimeout(timer.current); if (voiceUsed.current) window.speechSynthesis?.cancel(); voiceUsed.current = false; setPlaying(false); setChapter(0); setVoiceMessage(''); }, [reading.runId]);
  useEffect(() => () => { token.current++; clearTimeout(timer.current); if (voiceUsed.current) window.speechSynthesis?.cancel(); }, []);
  function start(from = 0) {
    stop(); setOpen(true); setPlaying(true);
    const activeToken = token.current;
    const narration = reading.narration;
    const synth = window.speechSynthesis;
    const voices = synth?.getVoices() || [];
    const voice = voices.find(v => v.lang.startsWith('es'));
    function next(index) {
      if (token.current !== activeToken) return;
      if (index >= narration.chapters.length) { setPlaying(false); return; }
      setChapter(index);
      const text = narration.chapters[index].text;
      if (synth && typeof window.SpeechSynthesisUtterance === 'function') {
        const utterance = new SpeechSynthesisUtterance(`${narration.chapters[index].title}. ${text}`);
        utterance.lang = 'es-CL'; utterance.rate = .95;
        if (voice) utterance.voice = voice;
        utterance.onend = () => next(index + 1);
        utterance.onerror = () => { if (token.current === activeToken) { setPlaying(false); setVoiceMessage('La voz del navegador no está disponible. El guion y las cifras siguen visibles.'); } };
        voiceUsed.current = true; synth.speak(utterance);
      } else { setVoiceMessage('Modo visual: este navegador no ofrece voz.'); timer.current = setTimeout(() => next(index + 1), Math.max(8000, text.split(' ').length * 400)); }
    }
    next(from);
  }
  return <div className={styles.player} data-testid="snapshot-player" data-run-id={reading.runId}>
    <div className={styles.playerBar}><div><span className={styles.eyebrow}>EXPLICACIÓN AUDIOVISUAL</span><p>El mismo corte, las mismas hipótesis, las mismas cifras.</p></div><button type="button" onClick={() => open ? (stop(), setOpen(false)) : setOpen(true)} aria-expanded={open}>{open ? 'Cerrar explicación' : 'Ver y escuchar la lectura'} {open ? '−' : '↗'}</button></div>
    {open && <div className={styles.playerBody}>
      <div className={styles.chapterTrack}>{reading.narration.chapters.map((c, i) => <button key={c.key} type="button" aria-label={`Capítulo ${i + 1}: ${c.title}`} aria-current={chapter === i ? 'step' : undefined} onClick={() => { stop(); setChapter(i); }}>{String(i + 1).padStart(2, '0')}</button>)}</div>
      <span className={styles.eyebrow}>CAPÍTULO {chapter + 1} · {reading.narration.chapters.length}</span><h3>{current.title}</h3>
      <div className={styles.playerFigures}>{current.figures.map((point, i) => <Figure key={`${chapter}-${i}`} point={point.label === 'Cierre observado' ? { ...point, unit: `${reading.currency}/share` } : point} />)}</div>
      <p className={styles.subtitle} aria-live="polite">{current.text}</p>
      <div className={styles.playerControls}><button type="button" onClick={() => playing ? stop() : start(chapter)}>{playing ? 'Detener narración' : 'Reproducir con voz'}</button><button type="button" onClick={() => { stop(); setChapter(Math.min(chapter + 1, reading.narration.chapters.length - 1)); }} disabled={chapter === reading.narration.chapters.length - 1}>Siguiente capítulo →</button></div>
      {voiceMessage && <p role="status">{voiceMessage}</p>}<small>Guion determinista · voz del navegador · {reading.snapshotId} · {reading.runId}</small>
    </div>}
  </div>;
}

function ThesisLedger({ reading, snapshot, missingDebt, policy }) {
  const definitions = snapshot.assumptionDefinitions || READING_ASSUMPTIONS;
  const [ledger, setLedger] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState(null), [scope, setScope] = useState('guest');
  const endpoint = `/api/public/company-thesis/${encodeURIComponent(reading.ticker)}`;
  const alive = useRef(true);
  async function refresh() {
    try { const response = await fetch(endpoint, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error); if (alive.current) { setLedger(body.ledger); setScope(body.scope || 'guest'); setError(''); } }
    catch (e) { if (alive.current) setError(e.message || 'No se pudo cargar el registro.'); }
  }
  useEffect(() => { alive.current = true; refresh(); return () => { alive.current = false; }; }, [endpoint]);
  async function append(action) {
    setBusy(true); setError('');
    try {
      const assumptions = Object.fromEntries(Object.keys(definitions).map(key => [key, reading.assumptions[key]]));
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedVersion: ledger.version, snapshotId: snapshot.id, runId: reading.runId, policy, assumptions, weight: reading.portfolio.weight?.value ?? .1, thesisVersion: Number(selected), case: missingDebt ? 'missing-debt' : undefined }) });
      const body = await response.json(); if (!response.ok) { if (response.status === 409) await refresh(); throw new Error(body.error); }
      setLedger(body.ledger);
      if (action === 'commit') setSelected(body.ledger.version);
    } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setBusy(false); }
  }
  const versions = ledger?.events.filter(event => event.type === 'thesis') || [];
  const version = versions.find(event => event.version === Number(selected));
  const evidence = ledger?.events.filter(event => event.type === 'evidence' && event.payload.thesisVersion === Number(selected)) || [];
  return <section className={styles.ledger} aria-labelledby="ledger-title">
    <span className={styles.eyebrow}>MEMORIA DE INVESTIGACIÓN</span><h2 id="ledger-title">Lo que se esperaba. Lo que ocurrió.</h2>
    <p>Guardar fija este snapshot, sus hipótesis, criterios y resultados. Cambiar una hipótesis crea otra versión. La evidencia se añade a la versión elegida.</p>
    <p className={styles.muted}>{scope === 'account' ? 'Registro asociado a tu cuenta y espacio de trabajo; disponible al iniciar sesión en otro dispositivo.' : 'Registro de invitado, aislado por navegador. Inicia sesión para conservar tus tesis entre dispositivos.'} {reading.mode === 'historical_reconstruction' ? 'Reconstrucción histórica: no acredita anticipación del resultado.' : 'La fecha real de guardado determina si la expectativa precede al resultado.'}</p>
    <div className={styles.ledgerActions}><button type="button" disabled={!ledger || busy || reading.status !== 'research'} onClick={() => append('commit')}>{busy ? 'Guardando…' : 'Fijar esta versión'}</button><button type="button" onClick={refresh} disabled={busy}>Recargar registro</button>
      <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ snapshot, reading, ledger }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${reading.ticker}-${reading.runId}.json`; a.click(); URL.revokeObjectURL(url); }}>Exportar snapshot y registro</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {ledger && !versions.length && <p className={styles.muted}>Aún no hay expectativas fijadas. La primera versión guardará la fecha real de creación.</p>}
    {versions.length > 0 && <>
      <div className={styles.versionSelect}><label htmlFor="thesis-version">Versión a contrastar</label><select id="thesis-version" value={selected ?? ''} onChange={e => setSelected(Number(e.target.value))}><option value="" disabled>Seleccionar versión</option>{versions.map(event => <option key={event.version} value={event.version}>v{event.version} · {dateTime(event.recordedAt)} · {event.payload.reading.runId}</option>)}</select></div>
      {version && <div className={styles.frozenVersion} data-testid="frozen-version"><div><strong>v{version.version} · fijada {dateTime(version.recordedAt)}</strong><span>Centro guardado {money(version.payload.reading.valuation.central.value, version.payload.reading.currency)}</span></div><p>Snapshot {version.payload.reading.snapshotId}. Cálculo {version.payload.reading.runId}. {version.payload.hindsight ? 'Registro retrospectivo.' : 'Expectativas conservadas con fecha real de creación.'} SHA-256 {version.hash.slice(0, 16)}…</p>
        <div className={styles.expectationRows}>{version.payload.reading.expectations.map(item => <div key={item.key}><span>{item.label}</span><strong>{item.direction === 'min' ? '≥' : '≤'} {pct(item.threshold)}</strong><small>Cierre {item.due} · hipótesis {item.source.publishedAt} · {item.source.label} · {item.dueBasis}</small></div>)}</div>
        <button type="button" disabled={busy || (version.payload.hindsight && evidence.length > 0)} onClick={() => append('evidence')}>{version.payload.hindsight ? evidence.length ? 'Evidencia FY2025 registrada' : 'Añadir evidencia posterior FY2025' : 'Buscar y añadir evidencia posterior'}</button>
        {evidence.map(event => <div key={event.version} className={styles.evidenceComparison} data-testid="evidence-comparison"><p><strong>e{event.version} · añadida {dateTime(event.recordedAt)}</strong> · publicación {event.payload.assessment.availableOn}</p><p>{event.payload.assessment.disclosure}</p>{event.payload.assessment.checks.map(check => <div key={check.key} data-state={check.status}><span>{check.label}</span><strong>{check.status === 'refuted' ? 'Refutada' : check.status === 'supported' ? 'Compatible' : check.status === 'missing' ? 'Dato faltante' : 'No comparable'}</strong><Figure point={check.observed} /></div>)}</div>)}
      </div>}
    </>}
    {ledger && ledger.events.length > 0 && <details className={styles.audit}><summary>Cadena de versiones · {ledger.events.length} eventos</summary>{ledger.events.map(event => <p key={event.version}>v{event.version} · {event.type === 'thesis' ? 'Tesis fijada' : `Evidencia para v${event.payload.thesisVersion}`} · {dateTime(event.recordedAt)} · {event.hash.slice(0, 16)}…</p>)}<p>Checksums encadenados detectan alteraciones en el archivo. No constituyen un sello de tiempo externo.</p></details>}
  </section>;
}

export default function CompanyThesisWorkspace({ snapshot: sourceSnapshot, missingDebt = false }) {
  const [snapshot, setSnapshot] = useState(sourceSnapshot), [policy, setPolicy] = useState(null), [tickerInput, setTickerInput] = useState(sourceSnapshot.ticker);
  const definitions = snapshot.assumptionDefinitions || READING_ASSUMPTIONS;
  const money = value => readingValue({ value, unit: `${snapshot.currency}/share`, currency: snapshot.currency });
  const [overrides, setOverrides] = useState({}), [weight, setWeight] = useState(.1), [error, setError] = useState(''), [active, setActive] = useState(0);
  const reading = useMemo(() => buildCompanyReading(snapshot, overrides, { weight }), [snapshot, overrides, weight]);
  const baseline = useMemo(() => buildCompanyReading(snapshot), [snapshot]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) setActive(Number(entry.target.id.replace('reading-', ''))); }, { rootMargin: '-15% 0px -65% 0px' });
    document.querySelectorAll('[id^="reading-"]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [reading.status]);
  function change(key, value) {
    const next = { ...overrides, [key]: value };
    try { buildCompanyReading(snapshot, next, { weight }); setOverrides(next); setError(''); }
    catch (e) { setError(e.message); }
  }
  const unavailable = reading.status !== 'research';
  const baselineVideo = !missingDebt && reading.ticker === 'MSFT' && reading.snapshotId === readingMediaManifest.snapshotId && reading.runId === readingMediaManifest.runId;
  return <main className={styles.page} data-testid="company-thesis" data-run-id={reading.runId}>
    <div className={styles.breadcrumb}><Link href="/aurora">AURORA</Link><span>/</span><Link href={`/company/${reading.ticker}`}>{reading.ticker}</Link><span>/</span><span>Tesis refutable</span></div>
    <form className={styles.companySearch} action={`/company/${encodeURIComponent(tickerInput.trim().toUpperCase())}/thesis`}><label htmlFor="reading-ticker">Empresa a investigar</label><input id="reading-ticker" value={tickerInput} onChange={e => setTickerInput(e.target.value)} maxLength={16} pattern="[A-Za-z0-9.\-]{1,16}" required /><button type="submit">Investigar empresa</button></form>
    <header className={styles.intro}><div><p className={styles.eyebrow}>LECTURA DE EMPRESA · {unavailable ? reading.status === 'partial' ? 'COBERTURA PARCIAL' : 'ABSTENCIÓN' : reading.mode === 'historical_reconstruction' ? 'CORTE HISTÓRICO' : 'INVESTIGACIÓN ACTUAL'}</p><h1>{reading.companyName}</h1><p className={styles.introText}>{unavailable ? 'Conserva la evidencia disponible y resuelve las brechas antes de valorar.' : 'Explora el negocio. Cambia una hipótesis. Comprueba qué conclusión deja de sostenerse.'}</p></div><div className={styles.snapshotTag}><strong>{reading.currency || 'Moneda faltante'} · {reading.cutoff || 'Fecha faltante'}</strong><span>{reading.snapshotId}</span><span>Motor {reading.modelVersion}</span></div></header>
    <p className={styles.disclosure}>{reading.disclosure || 'Sin snapshot de cobertura suficiente.'}</p>
    <div className={styles.toolbar}><Link href="/company/MSFT/thesis?view=historical&lang=es">Ejemplo histórico con cobertura</Link><Link href="/company/MSFT/thesis?case=missing-debt&lang=es">Probar abstención: deuda ausente</Link><Link href="/factorlab?lang=es">FactorLab</Link><Link href={`/breakpoint/${reading.ticker}?lang=es`}>Breakpoint</Link><Link href="/stress?lang=es">Stress Engine</Link></div>
    {snapshot.schema === 'company_reading_snapshot_v2' && <>
      <section className={styles.coverage} aria-label="Cobertura y método"><h2>Qué permite estudiar la evidencia</h2><p>Familia de negocio: {snapshot.valuationPlan.archetype} · método propuesto: {snapshot.valuationPlan.primaryMethod}. {snapshot.valuationPlan.supported ? 'Esta lectura calcula FCFF condicionado a hipótesis explícitas.' : 'El método específico requiere validación adicional antes de publicar un rango.'}</p><p>Referencia para el próximo cierre fiscal: {snapshot.nextFiscalEnd || 'No disponible'}. Ventana de contraste: siete días alrededor del aniversario fiscal observado. Captura: {snapshot.capturedAt}. Los segmentos ausentes permanecen ausentes.</p></section>
      {snapshot.valuationPlan.supported && <CompanyThesisHypotheses snapshot={sourceSnapshot} onConfigure={(configured, nextPolicy) => { setSnapshot(configured); setPolicy(nextPolicy); setOverrides({}); setError(''); }} />}
    </>}
    <SnapshotPlayer reading={reading} />
    {baselineVideo && <details className={styles.recordedVideo}><summary>Video narrado del snapshot original · voz en español</summary><video controls preload="none" aria-label="Explicación audiovisual Microsoft del snapshot original" poster="/media/msft-reading-poster.png" src="/media/msft-reading-v1.mp4"><track kind="captions" src="/media/msft-reading-v1.vtt" srcLang="es" label="Español" default /></video><p>{reading.snapshotId} · {reading.runId}. Si cambias hipótesis o peso, usa la explicación interactiva recalculada.</p></details>}
    {unavailable ? <section className={styles.abstention} role="status"><span className={styles.eyebrow}>EL MOTOR SE ABSTIENE DE VALORAR</span><h2>No se publica rango ni impacto en cartera.</h2><p>El dato faltante permanece faltante. El lenguaje no completa el cálculo.</p><ul>{reading.blockers.map((b, i) => <li key={`${b.key}-${i}`}>{b.message}</li>)}</ul><h3>Negocio y evidencia disponible</h3><p>{reading.business.summary}</p><Provenance point={{ value: reading.business.summary, asOf: reading.business.asOf, sources: reading.business.sources, provenance: 'observed' }} /><div className={styles.auditFigures}>{Object.entries(snapshot.facts).filter(([key, p]) => p.value !== null || key === 'debt').map(([key, point]) => <Figure key={key} point={key.startsWith('price') ? { ...point, unit: `${reading.currency}/share` } : point} />)}</div><h3>Qué investigar para cerrar las brechas</h3><ul>{reading.researchQuestions.map(q => <li key={q}>{q}</li>)}</ul><Link href="/company/MSFT/thesis?view=historical&lang=es">Ver el ejemplo histórico completo →</Link></section> : <div className={styles.layout}>
      <nav className={styles.stepNav} aria-label="Secuencia de la lectura">{STEPS.map((step, i) => <a key={step} href={`#reading-${i}`} aria-current={active === i ? 'step' : undefined}><span>{String(i + 1).padStart(2, '0')}</span>{step}</a>)}<a href="#ledger-title"><span>↳</span>Registro de tesis</a><p>Cifras del motor.<br />Lenguaje para explicarlas.</p></nav>
      <div className={styles.readingBody}>
        <Section index={0} title="De dónde vienen los ingresos" hint="Segmentos publicados y necesidades de capital documentadas."><p className={styles.businessSummary}>{reading.business.summary}</p><Provenance point={{ value: reading.business.summary, asOf: reading.business.asOf, sources: reading.business.sources, provenance: 'observed' }} />{reading.business.segments.length && reading.business.segments.every(p => typeof p.value === 'number') ? <div className={styles.segmentBar} role="img" aria-label="Participación de los segmentos en los ingresos">{reading.business.segments.map((p, i) => <div key={i} style={{ width: `${p.value / reading.facts.revenue.value * 100}%` }} />)}</div> : <p>Desglose de segmentos: no disponible con evidencia comparable.</p>}<div className={styles.segments}>{reading.business.segments.map(point => <Figure key={point.label} point={point} />)}</div></Section>
        <Section index={1} title="Economía disponible; límites visibles" hint="Los agregados consolidados permiten estudiar conversión. No identifican la economía de cada cliente."><div className={styles.economics}><Figure point={reading.facts.operatingMargin} /><Figure point={reading.facts.trailingFcf} /><Figure point={reading.facts.capexIntensity} /></div><div className={styles.missingList}>{Object.values(reading.unitEconomics).map(point => <div key={point.label}><span>{point.label}</span><strong>{readingValue(point)}</strong><p>{point.reason}</p><Provenance point={point} /></div>)}</div></Section>
        <Section index={2} title="Lo que tendría que cumplirse para justificar el precio" hint="Se resuelve el mismo modelo hacia atrás, manteniendo los demás supuestos fijos."><div className={styles.implied}><Figure point={{ ...reading.facts.price, unit: `${reading.currency}/share` }} large /><span className={styles.arrow}>→</span><Figure point={reading.impliedGrowth} large /></div><p>El crecimiento inicial se desvanece hacia {pct(reading.assumptions.terminalGrowth)} en el horizonte. El precio admite otras combinaciones de margen, descuento y reinversión: esta es una solución condicionada.</p><small>Supuesto terminal · {reading.assumptionSource.publishedAt} · {reading.assumptionSource.label}</small></Section>
        <Section index={3} title="Cuánto vale bajo estas hipótesis" hint="Tres escenarios explícitos, sin probabilidades ni objetivo de cotización."><RangeChart reading={reading} /><div className={styles.valuationFigures}><Figure point={reading.valuation.low} /><Figure point={reading.valuation.central} large /><Figure point={reading.valuation.high} /></div><div className={styles.bridge}><Figure point={reading.valuation.enterpriseValue} /><span>−</span><Figure point={reading.facts.netDebt} /><span>=</span><Figure point={reading.valuation.equityValue} /></div><Figure point={reading.valuation.terminalShare} /><details className={styles.audit}><summary>Conciliar acciones, moneda, deuda y modelo</summary><div className={styles.auditFigures}>{['sharesOutstanding', 'dilutedShares', 'cash', 'debt', 'financeLeases', 'operatingLeases', 'marketCap'].map(key => <Figure key={key} point={reading.facts[key]} />)}<Figure point={reading.valuation.effectiveShares} /></div><ul>{reading.limitations.map(l => <li key={l}>{l}</li>)}</ul><p>Horizonte: {reading.assumptions.years} años · {reading.assumptionSource.publishedAt} · {reading.assumptionSource.label}.</p><p>FCFF se calcula desde resultado operativo después de impuesto y reinversión neta. CFO−capex se usa solo para contrastar evidencia.</p></details></Section>
        <Section index={4} title="Intenta romper la tesis" hint="Las hipótesis son editables; los hechos observados permanecen ligados a sus fuentes."><div className={styles.refutation}>
          <div className={styles.controls}>{Object.entries(definitions).map(([key, definition]) => <label key={key} htmlFor={`assumption-${key}`}><span>{definition.label}<output>{pct(reading.assumptions[key])}</output></span><input id={`assumption-${key}`} aria-label={definition.label} type="range" min={definition.min} max={definition.max} step={definition.step} value={reading.assumptions[key]} onChange={event => change(key, Number(event.target.value))} /><small>Hipótesis · {reading.assumptionSource.publishedAt} · {Object.hasOwn(overrides, key) ? 'Editada por el usuario' : reading.assumptionSource.label}</small></label>)}<button type="button" onClick={() => { setOverrides({}); setError(''); }}>Restablecer hipótesis</button><button type="button" onClick={() => { const next = snapshot.schema === 'company_reading_snapshot_v1' ? { ...overrides, growth: .02, margin: .3, reinvestment: .5 } : { ...overrides, growth: Math.max(definitions.growth.min, definitions.growth.value - .03), margin: Math.max(definitions.margin.min, definitions.margin.value - .03), reinvestment: Math.min(definitions.reinvestment.max, definitions.reinvestment.value + .1) }; setOverrides(next); setError(''); }}>Ensayar menor crecimiento y conversión</button>{error && <p role="alert" className={styles.error}>{error}</p>}</div>
          <div className={styles.conclusions} aria-live="polite" data-testid="thesis-conclusions"><span className={styles.eyebrow}>QUÉ CONCLUSIÓN CAMBIA</span><Figure point={reading.valuation.central} /><p>Centro del snapshot original: {money(baseline.valuation.central.value)} · cálculo {baseline.cutoff} · {baseline.modelVersion}.</p>{reading.conclusions.map(c => <article key={c.id} data-state={c.holds ? 'holds' : 'fails'}><span>{c.holds ? 'Se sostiene' : c.baselineHolds ? 'Deja de sostenerse' : 'No se sostiene'}</span><p>{c.text}</p><small>Criterio {c.direction === 'min' ? '≥' : '≤'} {readingValue(c.thresholdPoint)} · {reading.assumptionSource.publishedAt} · política de tesis.</small></article>)}</div>
        </div><div className={styles.sensitivity}><h3>Supuesto decisivo: {reading.decisive.label}</h3><p>Mayor efecto dentro de los cambios ensayados. El orden depende del tamaño del cambio; no compara probabilidades.</p>{reading.sensitivity.map(row => <div key={row.key}><span>{row.label}<small>{pct(row.from)} → {pct(row.to)} · hipótesis {reading.assumptionSource.publishedAt}</small></span><div className={styles.sensitivityTrack}><i style={{ width: `${Math.max(2, row.span / reading.decisive.span * 100)}%` }} /></div><span>{money(row.low.value)} — {money(row.high.value)}<small>Cálculo {reading.cutoff} · {reading.modelVersion}</small></span></div>)}</div></Section>
        <Section index={5} title="El caso adverso conserva sus supuestos" hint="Crecimiento menor, margen más estrecho, más reinversión y mayor costo de capital."><div className={styles.adverse}><Figure point={reading.adverse.value} large /><Figure point={reading.adverse.change} large /></div><div className={styles.scenarioAssumptions}>{Object.entries(definitions).map(([key, def]) => <span key={key}>{def.label}<strong>{pct(reading.adverse.assumptions[key])}</strong><small>Hipótesis {reading.assumptionSource.publishedAt}</small></span>)}</div><p>Este escenario queda fijo al refutar el central. La distancia entre valor de escenario y cierre no es una caída prevista.</p></Section>
        <Section index={6} title="Una exposición, un efecto acotado" hint="Cartera hipotética. Solo se atribuye el escenario de esta empresa; no se calcula el resto."><label className={styles.weightControl} htmlFor="portfolio-weight"><span>Peso de {reading.companyName} en el patrimonio <strong>{pct(weight)}</strong></span><input type="range" id="portfolio-weight" min="0" max="1" step=".01" value={weight} onChange={event => setWeight(Number(event.target.value))} /><small>Hipótesis del usuario · {reading.authoredAt}</small></label><div className={styles.portfolio}><Figure point={reading.portfolio.contribution} large /><div><span>Riesgo total de cartera</span><strong>No disponible</strong><p>Faltan posiciones, horizontes y escenarios conjuntos. Sin esos datos no hay VaR, correlación ni pérdida total.</p></div></div><p>{reading.portfolio.source}. Peso × distancia adversa al precio. <Link href="/stress?lang=es">Abrir el análisis conjunto de Stress Engine →</Link></p></Section>
        <section className={styles.researchNext}><h2>Qué investigar después</h2><ol>{reading.researchQuestions.map(q => <li key={q}>{q}</li>)}</ol><p>FactorLab deja sin resolver: {reading.factorlab.unresolved.join(', ')}. El flujo de un solo año no acredita caja normalizada ni una oportunidad de operación.</p><Link href="/factorlab?lang=es">Contrastar cobertura en FactorLab →</Link></section>
      </div>
    </div>}
    {!unavailable && <CompanyThesisUnderstanding key={reading.runId} runId={reading.runId} />}
    <ThesisLedger reading={reading} snapshot={snapshot} missingDebt={missingDebt} policy={policy} />
    <details className={styles.audit}><summary>Contrato de la lectura y del lenguaje</summary><p>Snapshot {reading.snapshotId} · cálculo {reading.runId} · {reading.modelVersion}.</p><p>AURORA calcula FCFF; Breakpoint resuelve la condición de equilibrio; FactorLab evalúa las brechas de investigación; Stress Engine atribuye el escenario a la exposición hipotética. Los enlaces abren sus espacios completos con sus propias fechas.</p><p>El guion audiovisual se construye desde este resultado. No se llama a un LLM ni se acepta una cifra generada por lenguaje. El servidor recalcula antes de guardar.</p></details>
  </main>;
}
