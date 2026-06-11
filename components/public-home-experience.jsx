"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/home-page.module.css";
import { LANGUAGE_STORAGE_KEY, writeStoredLanguage } from "@/components/language-layer";

const COPY = {
  en: {
    languageName: "English",
    navAria: "Primary",
    workspaceNavAria: "Workspace navigation",
    languageAria: "Choose page language",
    nav: {
      product: "Product",
      macroBrain: "Macro Brain",
      factorlab: "FactorLab",
    },
    auth: {
      workspace: "Workspace",
      signOut: "Sign out",
      logIn: "Log in",
      getStarted: "Get started",
      openWorkspace: "Open workspace",
    },
    hero: {
      eyebrow: "Portfolio decisions, explained",
      titleStart: "Know what to do with your money",
      titleAccent: "before you act.",
      body:
        "BLS Prime turns cash, holdings, market context, and research into one clear next step: act, wait, or reject.",
      primaryAuthed: "Open workspace",
      primaryGuest: "Get started",
      secondary: "See the workspace",
    },
    workflow: {
      tag: "What you get",
      title: "One calm read before you move.",
      body:
        "The workspace shows what changed, what can go wrong, and what action is allowed by your own rules.",
    },
    research: {
      tag: "Research desk",
      title: "The answer comes with reasons, not mystique.",
      body:
        "For each decision, BLS Prime shows the data it used, the risks it found, the disagreement between signals, and the reason the final answer won.",
      primary: "Explore the workspace",
      secondary: "Start with your portfolio",
    },
    cta: {
      tag: "BLS Prime",
      title: "Move only when the evidence is clear enough.",
      body:
        "Set your rules once, review each decision in plain language, and keep a record of why you acted, waited, or rejected an idea.",
      secondary: "See how it works",
    },
    footer: {
      text: "Multi-layer portfolio intelligence. Not financial advice.",
      terms: "Terms of Service",
    },
    preview: {
      sidebarHint: "Decision workspace",
      sidebarMeta: ["Cash", "Portfolio", "Research"],
      items: [
        { label: "Inputs", target: "inputs" },
        { label: "What matters", target: "attention" },
        { label: "Checks", target: "layers" },
        { label: "Tradeoffs", target: "consensus" },
        { label: "Decision", target: "decision" },
      ],
      tabs: [
        { label: "Brief", target: "decision" },
        { label: "Checks", target: "layers" },
        { label: "Tradeoffs", target: "consensus" },
      ],
      topLabel: "Decision engine",
      topTitle: "Plain-language portfolio review",
      topDate: "Live example",
      topStatus: "Click any section to inspect it",
      ask: "Ask: what changed the decision?",
      leadTag: "Final decision",
      leadTitle: "Wait before adding more risk.",
      leadBody:
        "Some assets look attractive, but the portfolio is still too dependent on the same few risks. The system stages a smaller action instead of a broad add.",
      leadStats: [
        { label: "Final call", value: "Wait" },
        { label: "Confidence", value: "72%" },
        { label: "Action status", value: "Staged" },
      ],
      inputsTag: "1. Inputs",
      inputsTitle: "The review starts with five simple sources.",
      inputs: [
        { title: "Market data", detail: "Price, volume, volatility" },
        { title: "Fundamentals", detail: "Cash flow, debt, margins" },
        { title: "News and sentiment", detail: "Real-time narrative shift" },
        { title: "Your portfolio", detail: "Holdings, limits, exposures" },
        { title: "Policy rules", detail: "What actions are allowed" },
      ],
      attentionTag: "2. What matters",
      attentionTitle: "The app finds what changed the decision.",
      attentionBody:
        "In plain terms: it pays less attention to background noise and more attention to the few facts that change what you should do.",
      layerTag: "3. Checks",
      layerTitle: "Each proposed move gets tested from several angles.",
      layerRows: [
        { label: "Value check", detail: "Is the price reasonable?", stance: "Support", value: "78%" },
        { label: "Risk check", detail: "What can break first?", stance: "Warn", value: "62%" },
        { label: "Market backdrop", detail: "Is the market helping?", stance: "Neutral", value: "55%" },
        { label: "Crowding check", detail: "Are too many bets similar?", stance: "Warn", value: "71%" },
      ],
      consensusTag: "4. Tradeoffs",
      consensusTitle: "The final answer weighs reward against what can go wrong.",
      consensusRows: ["Value", "Risk", "Market", "Crowding"],
      actionTag: "5. Action plan",
      actionTitle: "What the decision becomes in the real portfolio.",
      actions: [
        { label: "Hold", detail: "Keep size steady for now", value: "No change" },
        { label: "Wait", detail: "Do not add broad risk yet", value: "24h" },
        { label: "Review", detail: "Re-run when risks improve", value: "Next" },
      ],
    },
    support: [
      {
        title: "A clear first read",
        body: "Start with the one thing the portfolio is telling you today.",
      },
      {
        title: "Risks in plain language",
        body: "See what could hurt the portfolio without needing to decode market jargon.",
      },
      {
        title: "Reasons you can inspect",
        body: "Every answer shows the checks and evidence that changed the decision.",
      },
    ],
  },
  es: {
    languageName: "Español",
    navAria: "Principal",
    workspaceNavAria: "Navegación del espacio",
    languageAria: "Elegir idioma de la página",
    nav: {
      product: "Producto",
      macroBrain: "Macro Brain",
      factorlab: "FactorLab",
    },
    auth: {
      workspace: "Espacio",
      signOut: "Cerrar sesión",
      logIn: "Iniciar sesión",
      getStarted: "Empezar",
      openWorkspace: "Abrir espacio",
    },
    hero: {
      eyebrow: "Decisiones de portafolio, explicadas",
      titleStart: "Ten claro qué hacer con tu dinero",
      titleAccent: "antes de actuar.",
      body:
        "BLS Prime convierte caja, posiciones, mercado e investigación en un próximo paso claro: actuar, esperar o rechazar.",
      primaryAuthed: "Abrir espacio",
      primaryGuest: "Empezar",
      secondary: "Ver el espacio",
    },
    workflow: {
      tag: "Qué recibes",
      title: "Una lectura tranquila antes de moverte.",
      body:
        "El espacio muestra qué cambió, qué puede salir mal y qué acción permiten tus propias reglas.",
    },
    research: {
      tag: "Mesa de investigación",
      title: "La respuesta viene con razones, no con misterio.",
      body:
        "Para cada decisión, BLS Prime muestra los datos usados, los riesgos encontrados, el desacuerdo entre señales y la razón por la que ganó la respuesta final.",
      primary: "Explorar el espacio",
      secondary: "Empezar con tu portafolio",
    },
    cta: {
      tag: "BLS Prime",
      title: "Muévete solo cuando la evidencia sea suficientemente clara.",
      body:
        "Define tus reglas una vez, revisa cada decisión en lenguaje simple y guarda por qué actuaste, esperaste o rechazaste una idea.",
      secondary: "Ver cómo funciona",
    },
    footer: {
      text: "Inteligencia de portafolio multicapa. No es asesoría financiera.",
      terms: "Términos de Servicio",
    },
    preview: {
      sidebarHint: "Espacio de decisión",
      sidebarMeta: ["Caja", "Portafolio", "Investigación"],
      items: [
        { label: "Entradas", target: "inputs" },
        { label: "Lo importante", target: "attention" },
        { label: "Chequeos", target: "layers" },
        { label: "Tensiones", target: "consensus" },
        { label: "Decisión", target: "decision" },
      ],
      tabs: [
        { label: "Resumen", target: "decision" },
        { label: "Chequeos", target: "layers" },
        { label: "Tensiones", target: "consensus" },
      ],
      topLabel: "Motor de decisión",
      topTitle: "Revisión de portafolio en lenguaje claro",
      topDate: "Ejemplo en vivo",
      topStatus: "Toca una sección para explorarla",
      ask: "Pregunta: ¿qué cambió la decisión?",
      leadTag: "Decisión final",
      leadTitle: "Espera antes de agregar más riesgo.",
      leadBody:
        "Algunos activos se ven atractivos, pero el portafolio todavía depende demasiado de pocos riesgos. El sistema prepara una acción menor en vez de aumentar exposición de forma amplia.",
      leadStats: [
        { label: "Decisión final", value: "Esperar" },
        { label: "Confianza", value: "72%" },
        { label: "Estado", value: "En revisión" },
      ],
      inputsTag: "1. Entradas",
      inputsTitle: "La revisión empieza con cinco fuentes simples.",
      inputs: [
        { title: "Datos de mercado", detail: "Precio, volumen, volatilidad" },
        { title: "Fundamentos", detail: "Flujo de caja, deuda, márgenes" },
        { title: "Noticias y sentimiento", detail: "Cambio narrativo en tiempo real" },
        { title: "Tu portafolio", detail: "Posiciones, límites, exposiciones" },
        { title: "Tus reglas", detail: "Qué acciones están permitidas" },
      ],
      attentionTag: "2. Lo importante",
      attentionTitle: "La app encuentra qué cambió la decisión.",
      attentionBody:
        "En simple: presta menos atención al ruido y más atención a los pocos hechos que realmente cambian lo que deberías hacer.",
      layerTag: "3. Chequeos",
      layerTitle: "Cada movimiento propuesto se prueba desde varios ángulos.",
      layerRows: [
        { label: "Chequeo de valor", detail: "¿El precio es razonable?", stance: "Apoya", value: "78%" },
        { label: "Chequeo de riesgo", detail: "¿Qué puede romperse primero?", stance: "Advierte", value: "62%" },
        { label: "Contexto de mercado", detail: "¿El mercado ayuda?", stance: "Neutral", value: "55%" },
        { label: "Chequeo de solapamiento", detail: "¿Hay demasiadas apuestas parecidas?", stance: "Advierte", value: "71%" },
      ],
      consensusTag: "4. Tensiones",
      consensusTitle: "La respuesta final pesa recompensa contra lo que puede salir mal.",
      consensusRows: ["Valor", "Riesgo", "Mercado", "Solapamiento"],
      actionTag: "5. Plan de acción",
      actionTitle: "Cómo llega la decisión al portafolio real.",
      actions: [
        { label: "Mantener", detail: "No cambiar tamaño por ahora", value: "Sin cambio" },
        { label: "Esperar", detail: "No aumentar riesgo amplio todavía", value: "24h" },
        { label: "Revisar", detail: "Recalcular cuando mejoren los riesgos", value: "Sig." },
      ],
    },
    support: [
      {
        title: "Una primera lectura clara",
        body: "Parte por lo único que el portafolio te está diciendo hoy.",
      },
      {
        title: "Riesgos en lenguaje simple",
        body: "Ve qué podría dañar el portafolio sin tener que descifrar jerga de mercado.",
      },
      {
        title: "Razones que puedes revisar",
        body: "Cada respuesta muestra los chequeos y la evidencia que cambiaron la decisión.",
      },
    ],
  },
};

function normalizeLanguage(value) {
  return value === "es" ? "es" : "en";
}

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "es") {
    return stored;
  }

  return window.navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function PublicHomeExperience({ brand, isAuthenticated }) {
  const [language, setLanguage] = useState("en");
  const [hasResolvedLanguage, setHasResolvedLanguage] = useState(false);
  const copy = COPY[language];
  const primaryHref = isAuthenticated ? "/app" : "/login";
  const factorLabHref = isAuthenticated ? "/app#factorlab" : "/login?next=/app%23factorlab";
  const primaryLabel = isAuthenticated ? copy.hero.primaryAuthed : copy.hero.primaryGuest;

  useEffect(() => {
    const initialLanguage = getInitialLanguage();
    setLanguage(initialLanguage);
    setHasResolvedLanguage(true);
  }, []);

  useEffect(() => {
    if (!hasResolvedLanguage) {
      return;
    }

    writeStoredLanguage(language);
  }, [hasResolvedLanguage, language]);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandName}>{brand}</span>
        </Link>

        <div className={styles.navLinks} aria-label={copy.navAria}>
          <a data-testid="public-nav-product" href="#workspace">
            {copy.nav.product}
          </a>
          <Link data-testid="public-nav-macro-brain" href="/macro-brain">
            {copy.nav.macroBrain}
          </Link>
          <Link data-testid="public-nav-factorlab" href={factorLabHref}>
            {copy.nav.factorlab}
          </Link>
        </div>

        <div className={styles.navActions}>
          <LanguageToggle copy={copy} language={language} onChange={setLanguage} />

          {isAuthenticated ? (
            <>
              <Link className={styles.btnGhost} href="/app">
                {copy.auth.workspace}
              </Link>
              <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                <button className={styles.btnSecondary} type="submit">
                  {copy.auth.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className={styles.btnGhost} href="/login">
                {copy.auth.logIn}
              </Link>
              <Link className={styles.btnSecondary} href="/login">
                {copy.auth.getStarted}
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroIntro}>
          <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
          <h1 className={styles.headline}>
            {copy.hero.titleStart} <span className={styles.headlineAccent}>{copy.hero.titleAccent}</span>
          </h1>
          <p className={styles.subheadline}>{copy.hero.body}</p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={primaryHref}>
              {primaryLabel}
            </Link>
            <a className={styles.btnGhost} href="#workspace">
              {copy.hero.secondary}
            </a>
          </div>
        </div>

        <div className={styles.workspaceStage} id="workspace">
          <WorkspacePreview brand={brand} copy={copy} />
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionTag}>{copy.workflow.tag}</p>
          <h2 className={styles.sectionTitle}>{copy.workflow.title}</h2>
          <p className={styles.sectionBody}>{copy.workflow.body}</p>
        </div>

        <SupportStrip items={copy.support} />
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>{copy.cta.tag}</p>
        <h2 className={styles.finalTitle}>{copy.cta.title}</h2>
        <p className={styles.finalBody}>{copy.cta.body}</p>

        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className={styles.btnGhost} href="#workflow">
            {copy.cta.secondary}
          </a>
        </div>
      </section>

      <footer className={styles.footer} id="about">
        <p>
          (c) {new Date().getFullYear()} {brand}. {copy.footer.text}
        </p>
        <Link href="/terms">{copy.footer.terms}</Link>
      </footer>
    </main>
  );
}

function LanguageToggle({ copy, language, onChange }) {
  return (
    <div className={styles.languageToggle} aria-label={copy.languageAria} role="group">
      <span className={styles.languageLabel}>{language === "es" ? "Idioma" : "Language"}</span>
      {[
        { code: "en", label: "EN" },
        { code: "es", label: "ES" },
      ].map((option) => (
        <button
          aria-label={COPY[option.code].languageName}
          aria-pressed={language === option.code}
          className={styles.languageOption}
          data-active={language === option.code}
          data-testid={`language-${option.code}`}
          key={option.code}
          onClick={() => onChange(normalizeLanguage(option.code))}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function WorkspacePreview({ brand, copy = COPY.en }) {
  const preview = copy.preview;
  const [activePreviewSection, setActivePreviewSection] = useState("decision");
  const sectionRefs = useRef({});
  const activeTab = useMemo(
    () => preview.tabs.find((item) => item.target === activePreviewSection)?.target || preview.tabs[0].target,
    [activePreviewSection, preview.tabs],
  );

  function selectPreviewSection(target) {
    setActivePreviewSection(target);
    sectionRefs.current[target]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  return (
    <div className={styles.previewShell}>
      <aside className={styles.previewSidebar}>
        <div>
          <div className={styles.previewSidebarBrand}>{brand}</div>
          <div className={styles.previewSidebarHint}>{preview.sidebarHint}</div>
        </div>

        <nav className={styles.previewSidebarNav} aria-label={copy.workspaceNavAria}>
          {preview.items.map((item) => (
            <button
              className={styles.previewSidebarItem}
              data-active={activePreviewSection === item.target}
              data-testid={`preview-nav-${item.target}`}
              key={item.label}
              onClick={() => selectPreviewSection(item.target)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.previewSidebarMeta}>
          {preview.sidebarMeta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </aside>

      <div className={styles.previewMain}>
        <div className={styles.previewTopRow}>
          <div>
            <span className={styles.previewSectionLabel}>{preview.topLabel}</span>
            <strong>{preview.topTitle}</strong>
          </div>

          <div className={styles.previewTopMeta}>
            <span>{preview.topDate}</span>
            <span>{preview.topStatus}</span>
          </div>
        </div>

        <div className={styles.previewToolbar}>
          <div className={styles.previewTabs}>
            {preview.tabs.map((item) => (
              <button
                className={styles.previewTab}
                data-active={activeTab === item.target}
                data-testid={`preview-tab-${item.target}`}
                key={item.label}
                onClick={() => selectPreviewSection(item.target)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.previewSearch}>{preview.ask}</div>
        </div>

        <div className={styles.previewHeroGrid}>
          <section
            className={styles.previewLeadPanel}
            data-highlight={activePreviewSection === "decision"}
            ref={(node) => {
              sectionRefs.current.decision = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.leadTag}</p>
            <h3>{preview.leadTitle}</h3>
            <p>{preview.leadBody}</p>

            <div className={styles.previewLeadStats}>
              {preview.leadStats.map((item) => (
                <div className={styles.previewLeadStat} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside
            className={styles.previewReferencePanel}
            data-highlight={activePreviewSection === "inputs"}
            ref={(node) => {
              sectionRefs.current.inputs = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.inputsTag}</p>
            <h3>{preview.inputsTitle}</h3>
            <div className={styles.previewReferenceList}>
              {preview.inputs.map((item) => (
                <article className={styles.previewReferenceRow} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <div className={styles.previewDetailGrid}>
          <section
            className={styles.previewChartPanel}
            data-highlight={activePreviewSection === "attention"}
            ref={(node) => {
              sectionRefs.current.attention = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.attentionTag}</p>
            <h3>{preview.attentionTitle}</h3>
            <div className={styles.previewTransformerMap} aria-label={copy.languageName === "Español" ? "Mapa de señales importantes" : "Important signal map"}>
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <span key={`left-${item}`} />
              ))}
              <div className={styles.previewAttentionCore}>
                {[0, 1, 2].map((item) => (
                  <i key={`core-${item}`} />
                ))}
              </div>
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <span key={`right-${item}`} />
              ))}
            </div>
            <p className={styles.previewSmallCopy}>{preview.attentionBody}</p>
          </section>

          <section
            className={styles.previewTablePanel}
            data-highlight={activePreviewSection === "layers"}
            ref={(node) => {
              sectionRefs.current.layers = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.layerTag}</p>
            <h3>{preview.layerTitle}</h3>
            <div className={styles.previewAgentList}>
              {preview.layerRows.map((item) => (
                <article
                  className={styles.previewAgentRow}
                  data-stance={item.stance.toLowerCase()}
                  key={item.label}
                >
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <em>{item.stance}</em>
                  <b>{item.value}</b>
                </article>
              ))}
            </div>
          </section>

          <section
            className={styles.previewResearchPanel}
            data-highlight={activePreviewSection === "consensus"}
            ref={(node) => {
              sectionRefs.current.consensus = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.consensusTag}</p>
            <h3>{preview.consensusTitle}</h3>
            <div className={styles.previewConsensusGrid}>
              {preview.consensusRows.map((item, index) => (
                <div className={styles.previewConsensusRow} key={item}>
                  <span>{item}</span>
                  <i style={{ width: `${64 - index * 11}%` }} />
                  <strong>{22 - index * 3}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section
            className={styles.previewRepairPanel}
            data-highlight={activePreviewSection === "decision"}
            ref={(node) => {
              sectionRefs.current.action = node;
            }}
          >
            <p className={styles.previewModuleTag}>{preview.actionTag}</p>
            <h3>{preview.actionTitle}</h3>
            <div className={styles.previewTable}>
              {preview.actions.map((item) => (
                <div className={styles.previewTableRow} key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SupportStrip({ items = COPY.en.support }) {
  return (
    <div className={styles.supportStrip}>
      {items.map((item, index) => (
        <article className={styles.supportItem} key={item.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}
