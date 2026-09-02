"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/app/g820/g820.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";

const CATEGORY_ORDER = [
  "RESEARCH_NOW",
  "WATCH_FOR_PRICE",
  "DATA_EXCEPTION",
  "FALLING_KNIFE",
  "FUNDING_DEPENDENT",
  "CHEAP_BUT_STRUCTURALLY_IMPAIRED",
  "THESIS_BROKEN",
];

const COPY = {
  es: {
    eyebrow: "Graham · Capítulos 8 y 20",
    title: "Dislocación con doble margen de seguridad.",
    lead: "G820 exige dos pruebas separadas: que el precio esté más dañado que el negocio y que la inversión sobreviva aunque la valoración esté equivocada. Ordena diligencia; no recomienda compras.",
    license: "Licencia de evidencia",
    marketClock: "Reloj de mercado",
    ownerClock: "Reloj del propietario",
    daily: "Actualización diaria",
    dailyGood: (done, total) => `${done} de ${total} expedientes de la frontera con precio actualizado`,
    dailyMissing: "La capa diaria no está disponible; se muestra el snapshot reproducible.",
    priceOnly: "El precio y el margen de seguridad se recalculan cada día de mercado. Las llaves C8/C20 sólo cambian tras recompilar el motor completo.",
    dual: "Doble llave",
    chapter8: "Cap. 8",
    chapter20: "Cap. 20",
    valued: "Valorables",
    exceptions: "Excepciones",
    zero: "Ninguna empresa supera hoy ambas llaves.",
    zeroBody: "No es un error de la interfaz. La señal es deliberadamente escasa; la cola útil está en vigilar el precio y resolver desconocidos materiales.",
    search: "Buscar ticker, empresa, sector u objeción…",
    all: "Todas",
    company: "Empresa / diagnóstico",
    keys: "Llaves",
    mos: "Superávit MOS",
    market: "Mr. Market",
    more: (count) => `Mostrar 50 más · ${count} pendientes`,
    loading: "Cargando paquete probatorio G820…",
    unavailable: "G820 no está disponible ahora.",
    select: "Selecciona una empresa.",
    passport: "Pasaporte de inversión",
    snapshotPrice: "Precio del snapshot",
    dailyPrice: "Precio diario",
    ivFloor: "Valor intrínseco piso",
    ivBase: "Valor intrínseco base",
    actualMos: "MOS actual",
    requiredMos: "MOS requerido",
    surplus: "Superávit",
    noRerating: "TIR sin re-rating",
    robustness: "Robustez",
    priceGateOpen: "El precio abre el gate de MOS",
    priceGateClosed: "El precio aún no abre el gate de MOS",
    priceGateUnknown: "Gate de precio no resoluble",
    chapter8Question: "¿El precio está más dañado que el negocio?",
    chapter20Question: "¿Sobrevive si el modelo está equivocado?",
    priceDamage: "Daño de precio",
    businessDamage: "Daño del negocio",
    priceBusinessGap: "Brecha precio/negocio",
    independent: "Familias de valoración",
    survival: "Supervivencia",
    reflexivity: "Reflexividad",
    clocks: "Dos relojes",
    clocksNote: "El precio no reescribe el valor.",
    lattice: "Lattice de valoración",
    latticeNote: "Escenarios independientes por familia.",
    firewall: "Firewall de supervivencia",
    firewallNote: "Los fallos no se compensan.",
    redTeam: "Red team",
    blockers: "Bloqueos observados",
    falsifiers: "Falsificadores",
    noBlockers: "Sin bloqueos tipados.",
    disclosure: "Compilador de evidencia para priorizar investigación. No es asesoría financiera ni recomendación de compra o venta.",
    categories: {
      RESEARCH_NOW: "Investigar ahora",
      WATCH_FOR_PRICE: "Vigilar precio",
      DATA_EXCEPTION: "Excepción de datos",
      FALLING_KNIFE: "Cuchillo cayendo",
      FUNDING_DEPENDENT: "Dependiente de financiación",
      CHEAP_BUT_STRUCTURALLY_IMPAIRED: "Deterioro estructural",
      THESIS_BROKEN: "Tesis rota",
    },
  },
  en: {
    eyebrow: "Graham · Chapters 8 and 20",
    title: "Dislocation with a dual margin of safety.",
    lead: "G820 requires two separate proofs: price must be more damaged than the business, and the investment must survive even if valuation is wrong. It ranks diligence; it does not recommend trades.",
    license: "Evidence license",
    marketClock: "Market clock",
    ownerClock: "Owner clock",
    daily: "Daily refresh",
    dailyGood: (done, total) => `${done} of ${total} decision-frontier files refreshed`,
    dailyMissing: "The daily layer is unavailable; the reproducible snapshot is shown.",
    priceOnly: "Price and margin of safety refresh each market day. C8/C20 keys change only after a full engine rebuild.",
    dual: "Dual key",
    chapter8: "Ch. 8",
    chapter20: "Ch. 20",
    valued: "Valuable",
    exceptions: "Exceptions",
    zero: "No company passes both keys today.",
    zeroBody: "This is not a UI error. The signal is deliberately scarce; the useful queue is watching price and resolving material unknowns.",
    search: "Search ticker, company, sector, or objection…",
    all: "All",
    company: "Company / diagnosis",
    keys: "Keys",
    mos: "MOS surplus",
    market: "Mr. Market",
    more: (count) => `Show 50 more · ${count} remaining`,
    loading: "Loading the G820 evidence package…",
    unavailable: "G820 is unavailable right now.",
    select: "Select a company.",
    passport: "Investment passport",
    snapshotPrice: "Snapshot price",
    dailyPrice: "Daily price",
    ivFloor: "Intrinsic value floor",
    ivBase: "Intrinsic value base",
    actualMos: "Actual MOS",
    requiredMos: "Required MOS",
    surplus: "Surplus",
    noRerating: "No-rerating IRR",
    robustness: "Robustness",
    priceGateOpen: "Price clears the MOS gate",
    priceGateClosed: "Price does not clear the MOS gate yet",
    priceGateUnknown: "Price gate unresolved",
    chapter8Question: "Is price more damaged than the business?",
    chapter20Question: "Does it survive if the model is wrong?",
    priceDamage: "Price damage",
    businessDamage: "Business damage",
    priceBusinessGap: "Price/business gap",
    independent: "Valuation families",
    survival: "Survival",
    reflexivity: "Reflexivity",
    clocks: "Two clocks",
    clocksNote: "Price does not rewrite value.",
    lattice: "Valuation lattice",
    latticeNote: "Independent scenarios by family.",
    firewall: "Survival firewall",
    firewallNote: "Failures do not offset each other.",
    redTeam: "Red team",
    blockers: "Observed blockers",
    falsifiers: "Falsifiers",
    noBlockers: "No typed blockers.",
    disclosure: "Evidence compiler for research prioritization. Not financial advice or a recommendation to buy or sell.",
    categories: {
      RESEARCH_NOW: "Research now",
      WATCH_FOR_PRICE: "Watch price",
      DATA_EXCEPTION: "Data exception",
      FALLING_KNIFE: "Falling knife",
      FUNDING_DEPENDENT: "Funding dependent",
      CHEAP_BUT_STRUCTURALLY_IMPAIRED: "Structurally impaired",
      THESIS_BROKEN: "Thesis broken",
    },
  },
};

function number(value, language, digits = 1) {
  return Number.isFinite(value) ? new Intl.NumberFormat(language === "en" ? "en-US" : "es-CL", { maximumFractionDigits: digits }).format(value) : "N/E";
}

function percent(value, language) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${number(value * 100, language, 1)}%` : "N/E";
}

function money(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value) : "N/E";
}

function dateLabel(value, language) {
  if (!value) return "N/E";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function Key({ pass, children }) {
  return <span className={pass ? styles.keyPass : styles.keyClosed}>{pass ? "✓" : "×"} {children}</span>;
}

function statusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ").toUpperCase();
}

function Detail({ summary, detail, loading, error, copy, language }) {
  if (loading) return <aside className={styles.detailState}>{copy.loading}</aside>;
  if (error) return <aside className={`${styles.detailState} ${styles.error}`}>{error}</aside>;
  if (!summary || !detail) return <aside className={styles.detailState}>{copy.select}</aside>;
  const daily = summary.dailyPrice;
  const shownPrice = daily?.price ?? summary.price;
  const shownMos = daily?.actualMos ?? summary.actualMos;
  const shownSurplus = daily?.safetySurplus ?? summary.safetySurplus;
  const gateCopy = daily?.priceGate === "open" ? copy.priceGateOpen : daily?.priceGate === "closed" ? copy.priceGateClosed : copy.priceGateUnknown;

  return (
    <aside className={styles.detail} aria-label={`${copy.passport}: ${detail.identity.name}`}>
      <header className={styles.detailHeader}>
        <div><span>{detail.identity.ticker} · {detail.identity.sector}</span><h2>{detail.identity.name}</h2></div>
        <b>{copy.categories[detail.category] || detail.category}</b>
      </header>
      <div className={styles.license}>{detail.claimLicense} · LIVE ONLY · NO ES BUY</div>
      {daily ? <div className={styles.dailyGate} data-open={daily.priceGate === "open"}><strong>{gateCopy}</strong><span>{copy.dailyPrice} {money(daily.price)} · {dateLabel(daily.asOf, language)}</span><small>{copy.priceOnly}</small></div> : null}

      <section className={styles.passport} aria-label={copy.passport}>
        {[
          [daily ? copy.dailyPrice : copy.snapshotPrice, money(shownPrice)],
          [copy.ivFloor, money(detail.valuation.ivFloor)],
          [copy.ivBase, money(detail.valuation.ivBase)],
          [copy.actualMos, percent(shownMos, language)],
          [copy.requiredMos, percent(detail.safety.requiredMos.upper, language)],
          [copy.surplus, percent(shownSurplus, language)],
          [copy.noRerating, percent(detail.noReratingIrr?.value, language)],
          [copy.robustness, percent(detail.valuation.robustnessPassRate, language)],
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <section className={styles.dualPanel}>
        <article data-pass={detail.dualKey.chapter8}>
          <header><Key pass={detail.dualKey.chapter8}>C8</Key><strong>{number(detail.mrMarket.score, language)} / 100</strong></header>
          <h3>{copy.chapter8Question}</h3>
          <dl>
            <div><dt>{copy.priceDamage}</dt><dd>{number(detail.mrMarket.priceDamage?.value, language)}</dd></div>
            <div><dt>{copy.businessDamage}</dt><dd>{number(detail.mrMarket.businessDamage?.value, language)}</dd></div>
            <div><dt>{copy.priceBusinessGap}</dt><dd>{number(detail.mrMarket.priceBusinessGap?.value, language)}</dd></div>
          </dl>
        </article>
        <article data-pass={detail.dualKey.chapter20}>
          <header><Key pass={detail.dualKey.chapter20}>C20</Key><strong>{percent(shownSurplus, language)}</strong></header>
          <h3>{copy.chapter20Question}</h3>
          <dl>
            <div><dt>{copy.independent}</dt><dd>{detail.valuation.independentFamiliesSupporting || 0} / 2</dd></div>
            <div><dt>{copy.survival}</dt><dd>{statusLabel(detail.survival.status)}</dd></div>
            <div><dt>{copy.reflexivity}</dt><dd>{statusLabel(detail.reflexivity.status)}</dd></div>
          </dl>
        </article>
      </section>

      <EvidenceSection title={copy.clocks} note={copy.clocksNote}>
        <div className={styles.clockGrid}>
          {[detail.clocks.market, detail.clocks.owner].map((clock, index) => <div key={index}><strong>{index ? copy.ownerClock : copy.marketClock} · {percent(clock.coverage, language)}</strong>{clock.components.map((component) => <p key={component.key}><span>{component.key}</span><b>{Number.isFinite(component.score) ? number(component.score, language) : "UNKNOWN"}</b></p>)}</div>)}
        </div>
      </EvidenceSection>

      <EvidenceSection title={copy.lattice} note={copy.latticeNote}>
        <div className={styles.models}>{(detail.valuation.methods || []).map((method) => <div key={method.id}><span>{method.id.replaceAll("_", " ")}</span><b>{money(method.floor)} / {money(method.base)} / {money(method.upside)}</b><small>{method.scenarioCount} · {method.family}</small></div>)}</div>
      </EvidenceSection>

      <EvidenceSection title={copy.firewall} note={copy.firewallNote}>
        <div className={styles.gates}>{Object.entries(detail.survival.gates || {}).map(([key, gate]) => <div key={key} data-status={gate.status}><span>{key}</span><strong>{statusLabel(gate.status)}</strong><small>{gate.basis || gate.reason || ""}</small></div>)}</div>
      </EvidenceSection>

      <EvidenceSection title={copy.redTeam} note={detail.firstRejection || "—"}>
        <div className={styles.redTeam}><strong>{copy.blockers}</strong><ul>{detail.blockers?.length ? detail.blockers.map((item) => <li key={item}>{item}</li>) : <li>{copy.noBlockers}</li>}</ul><strong>{copy.falsifiers}</strong><ul>{(detail.falsifiers || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
      </EvidenceSection>
    </aside>
  );
}

function EvidenceSection({ title, note, children }) {
  return <section className={styles.evidenceSection}><header><span>{title}</span><small>{note}</small></header>{children}</section>;
}

export function G820Workstation({ initialLanguage = "es" }) {
  const { language } = useLanguagePreference(initialLanguage);
  const copy = COPY[language] || COPY.es;
  const [state, setState] = useState({ status: "loading", index: null, error: "" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [visible, setVisible] = useState(50);
  const [detailState, setDetailState] = useState({ id: "", detail: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/g820", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.message || copy.unavailable);
        return payload.index;
      })
      .then((index) => {
        setState({ status: "ready", index, error: "" });
        setSelectedId(index.companies?.[0]?.id || "");
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ status: "error", index: null, error: error.message }); });
    return () => controller.abort();
  }, []);

  const index = state.index;
  const selected = index?.companies.find((company) => company.id === selectedId) || null;
  useEffect(() => {
    if (!selected || !index) return undefined;
    const controller = new AbortController();
    setDetailState({ id: selected.id, detail: null, error: "" });
    fetch(`/${selected.detailRef}`, { cache: "force-cache", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`G820 detail ${response.status}`);
        const payload = await response.json();
        if (payload.schemaVersion !== "g820-company-v1" || payload.snapshotId !== index.meta.snapshotId || payload.id !== selected.id) throw new Error("G820 detail does not match the visible snapshot.");
        return payload.company;
      })
      .then((detail) => setDetailState({ id: selected.id, detail, error: "" }))
      .catch((error) => { if (error.name !== "AbortError") setDetailState({ id: selected.id, detail: null, error: error.message }); });
    return () => controller.abort();
  }, [selected, index]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(language === "en" ? "en" : "es");
    return (index?.companies || []).filter((company) => category === "all" || company.category === category).filter((company) => !query || [company.ticker, company.name, company.sector, company.industry, company.firstRejection || ""].join(" ").toLocaleLowerCase().includes(query));
  }, [index, search, category, language]);

  const currentDetail = detailState.id === selectedId ? detailState.detail : null;
  const detailError = detailState.id === selectedId ? detailState.error : "";
  const daily = index?.meta?.dailyPrice;

  if (state.status === "loading") return <main className={styles.shell}><PublicSiteHeader initialLanguage={initialLanguage} /><div className={styles.routeState}>{copy.loading}</div></main>;
  if (state.status === "error") return <main className={styles.shell}><PublicSiteHeader initialLanguage={initialLanguage} /><div className={`${styles.routeState} ${styles.error}`}>{state.error || copy.unavailable}</div></main>;

  return (
    <div className={styles.shell}>
      <PublicSiteHeader initialLanguage={initialLanguage} />
      <main>
        <section className={styles.hero}>
          <div><p>{copy.eyebrow} · {index.meta.engineVersion}</p><h1>{copy.title}</h1><span>{copy.lead}</span></div>
          <aside>
            <small>{copy.license}</small><strong>{index.meta.claimLicense}</strong>
            <span>{copy.marketClock} · {dateLabel(daily?.marketAsOf || index.meta.marketAsOf, language)}</span>
            <span>{copy.ownerClock} · {dateLabel(index.meta.ownerAsOfMaximum, language)}</span>
          </aside>
        </section>

        <section className={styles.dailyStrip} data-live={daily?.status === "available"}>
          <div><small>{copy.daily}</small><strong>{daily?.status === "available" ? copy.dailyGood(daily.coverage.succeeded, daily.coverage.requested) : copy.dailyMissing}</strong></div>
          <p>{copy.priceOnly}</p>
        </section>

        <section className={styles.auditStrip}>
          {[[copy.dual, index.meta.coverage.dualKeyPass], [copy.chapter8, index.meta.coverage.chapter8Pass], [copy.chapter20, index.meta.coverage.chapter20Pass], [copy.valued, index.meta.coverage.knownValuation], [copy.exceptions, index.meta.coverage.dataExceptions]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </section>

        {index.meta.coverage.dualKeyPass === 0 ? <section className={styles.zero}><b>0</b><div><strong>{copy.zero}</strong><p>{copy.zeroBody}</p></div></section> : null}

        <section className={styles.controls}>
          <input aria-label={copy.search} onChange={(event) => { setSearch(event.target.value); setVisible(50); }} placeholder={copy.search} value={search} />
          <div>
            <button data-active={category === "all"} onClick={() => { setCategory("all"); setVisible(50); }} type="button">{copy.all} <b>{index.meta.universeSize}</b></button>
            {CATEGORY_ORDER.filter((item) => index.meta.categoryCounts[item]).map((item) => <button data-active={category === item} key={item} onClick={() => { setCategory(item); setVisible(50); }} type="button">{copy.categories[item]} <b>{index.meta.categoryCounts[item]}</b></button>)}
          </div>
        </section>

        <section className={styles.workspace}>
          <div className={styles.list}>
            <header><span>{copy.company}</span><span>{copy.keys}</span><span>{copy.mos}</span><span>{copy.market}</span></header>
            {filtered.slice(0, visible).map((company) => {
              const surplus = company.dailyPrice?.safetySurplus ?? company.safetySurplus;
              return <button className={selectedId === company.id ? styles.selected : ""} key={company.id} onClick={() => setSelectedId(company.id)} type="button"><span><b>{company.ticker}</b><strong>{company.name}</strong><small>{copy.categories[company.category]} · {company.firstRejection || "—"}</small></span><span><Key pass={company.chapter8}>C8</Key><Key pass={company.chapter20}>C20</Key></span><span data-positive={surplus > 0}>{percent(surplus, language)}{company.dailyPrice ? <small>DAILY</small> : null}</span><span><b>{number(company.mrMarketScore, language)}</b><small>/100</small></span></button>;
            })}
            {visible < filtered.length ? <button className={styles.more} onClick={() => setVisible((value) => value + 50)} type="button">{copy.more(filtered.length - visible)}</button> : null}
          </div>
          <Detail summary={selected} detail={currentDetail} loading={Boolean(selected && !currentDetail && !detailError)} error={detailError} copy={copy} language={language} />
        </section>
      </main>
      <footer className={styles.footer}><strong>BLS Prime · G820</strong><p>{copy.disclosure}</p></footer>
    </div>
  );
}
