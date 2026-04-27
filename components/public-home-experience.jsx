"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/home-page.module.css";

const LANGUAGE_STORAGE_KEY = "blsprime_language_preference";

const COPY = {
  en: {
    languageName: "English",
    navAria: "Primary",
    workspaceNavAria: "Workspace navigation",
    languageAria: "Choose page language",
    nav: {
      product: "Product",
      solutions: "Solutions",
      research: "Research Layers",
      start: "Start",
      about: "About",
    },
    auth: {
      workspace: "Workspace",
      signOut: "Sign out",
      logIn: "Log in",
      getStarted: "Get started",
      openWorkspace: "Open workspace",
    },
    hero: {
      eyebrow: "AI-powered investment intelligence",
      titleStart: "We do not just analyze your portfolio. We",
      titleAccent: "understand it.",
      body:
        "BLS Prime uses a multi-layer transformer structure to read market data, weigh evidence, and turn complex portfolio signals into a clear next action.",
      primaryAuthed: "Open workspace",
      primaryGuest: "Get started",
      secondary: "See the workspace",
    },
    workflow: {
      tag: "Transformer operating model",
      title: "Signals become decisions through layers.",
      body:
        "No finance background needed. Each layer has a simple job: collect the evidence, find what matters, stress-test the disagreement, combine the views, and show the action.",
    },
    research: {
      tag: "Research layers",
      title: "Many analytical layers. One accountable answer.",
      body:
        "The system does not ask one model for an opinion. It routes the decision through layers for valuation, risk, macro, flows, and policy, then shows why the final call won.",
      primary: "View the engine",
      secondary: "Start with your portfolio",
    },
    cta: {
      tag: "BLS Prime",
      title: "Move only when the layers agree enough.",
      body:
        "Set your rules once, let the layers review every decision, and keep a record of which signals, weights, and checks led to action or restraint.",
      secondary: "See how it works",
    },
    footer: {
      text: "Multi-layer portfolio intelligence. Not financial advice.",
      terms: "Terms of Service",
    },
    preview: {
      sidebarHint: "Multi-layer transformer",
      sidebarMeta: ["5 signal layers", "4 specialist layers", "1 explainable decision"],
      items: [
        { label: "Inputs", target: "inputs" },
        { label: "Attention", target: "attention" },
        { label: "Layers", target: "layers" },
        { label: "Consensus", target: "consensus" },
        { label: "Decision", target: "decision" },
      ],
      tabs: [
        { label: "Brief", target: "decision" },
        { label: "Layers", target: "layers" },
        { label: "Consensus", target: "consensus" },
      ],
      topLabel: "Decision engine",
      topTitle: "Powered by multi-layer transformers",
      topDate: "Apr 22",
      topStatus: "Updated brief",
      ask: "Ask: which layers changed the decision?",
      leadTag: "Final decision",
      leadTitle: "Reduce risk. The rebound is still too fragile.",
      leadBody:
        "The layers disagree on valuation, but the attention layer gives more weight to risk, crowded flows, and your policy rules. The system stages a smaller action instead of a broad add.",
      leadStats: [
        { label: "Final call", value: "Reduce" },
        { label: "Confidence", value: "72%" },
        { label: "Action status", value: "Staged" },
      ],
      inputsTag: "1. Inputs",
      inputsTitle: "The engine starts with five plain sources.",
      inputs: [
        { title: "Market data", detail: "Price, volume, volatility" },
        { title: "Fundamentals", detail: "Cash flow, debt, margins" },
        { title: "News and sentiment", detail: "Real-time narrative shift" },
        { title: "Your portfolio", detail: "Holdings, limits, exposures" },
        { title: "Policy rules", detail: "What actions are allowed" },
      ],
      attentionTag: "2. Attention layers",
      attentionTitle: "The model finds what changed the decision.",
      attentionBody:
        "In human terms: it pays less attention to noise and more attention to the few signals that actually change what you should do.",
      layerTag: "3. Layer outputs",
      layerTitle: "Specialist layers test the same move.",
      layerRows: [
        { label: "Valuation layer", detail: "Is the price fair?", stance: "Support", value: "78%" },
        { label: "Risk layer", detail: "What can break first?", stance: "Warn", value: "62%" },
        { label: "Macro layer", detail: "Is the regime helping?", stance: "Neutral", value: "55%" },
        { label: "Flow layer", detail: "Are buyers real or crowded?", stance: "Warn", value: "71%" },
      ],
      consensusTag: "4. Aggregation",
      consensusTitle: "Consensus forms only after the layers are weighted.",
      consensusRows: ["Valuation", "Risk", "Macro", "Flow"],
      actionTag: "5. Action plan",
      actionTitle: "What the decision becomes in the real portfolio.",
      actions: [
        { label: "Trim", detail: "Reduce the fragile winner first", value: "-1.5%" },
        { label: "Wait", detail: "Do not add broad risk yet", value: "24h" },
        { label: "Review", detail: "Re-run when flow and repair agree", value: "Next" },
      ],
    },
    support: [
      {
        title: "Transformer-style decision engine",
        body: "The workspace reads many signals at once, then lets the important ones carry more weight.",
      },
      {
        title: "Layered debate",
        body: "Specialist layers test valuation, risk, macro, flows, and your own rules before a call is made.",
      },
      {
        title: "Attention to what matters",
        body: "Instead of showing every number, BLS Prime highlights the signals that changed the decision.",
      },
      {
        title: "Explainable action",
        body: "The final answer comes with the layers, weights, rule check, and next step that produced it.",
      },
    ],
  },
  es: {
    languageName: "Español",
    navAria: "Principal",
    workspaceNavAria: "Navegación del workspace",
    languageAria: "Elegir idioma de la página",
    nav: {
      product: "Producto",
      solutions: "Soluciones",
      research: "Capas de investigación",
      start: "Empezar",
      about: "Acerca de",
    },
    auth: {
      workspace: "Workspace",
      signOut: "Cerrar sesión",
      logIn: "Iniciar sesión",
      getStarted: "Empezar",
      openWorkspace: "Abrir workspace",
    },
    hero: {
      eyebrow: "Inteligencia de inversión impulsada por IA",
      titleStart: "No solo analizamos tu portafolio. Lo",
      titleAccent: "entendemos.",
      body:
        "BLS Prime usa una estructura transformer de múltiples capas para leer datos de mercado, ponderar evidencia y convertir señales complejas del portafolio en una próxima acción clara.",
      primaryAuthed: "Abrir workspace",
      primaryGuest: "Empezar",
      secondary: "Ver el workspace",
    },
    workflow: {
      tag: "Modelo operativo transformer",
      title: "Las señales se convierten en decisiones por capas.",
      body:
        "No necesitas saber finanzas. Cada capa tiene una tarea simple: reunir evidencia, detectar lo importante, tensionar el desacuerdo, combinar las vistas y mostrar la acción.",
    },
    research: {
      tag: "Capas de investigación",
      title: "Muchas capas analíticas. Una respuesta responsable.",
      body:
        "El sistema no le pide una opinión a un solo modelo. Enruta la decisión por capas de valoración, riesgo, macro, flujos y política, y luego muestra por qué ganó la decisión final.",
      primary: "Ver el motor",
      secondary: "Empezar con tu portafolio",
    },
    cta: {
      tag: "BLS Prime",
      title: "Muévete solo cuando las capas estén suficientemente de acuerdo.",
      body:
        "Define tus reglas una vez, deja que las capas revisen cada decisión y conserva un registro de qué señales, pesos y controles llevaron a actuar o esperar.",
      secondary: "Ver cómo funciona",
    },
    footer: {
      text: "Inteligencia de portafolio multicapa. No es asesoría financiera.",
      terms: "Términos de Servicio",
    },
    preview: {
      sidebarHint: "Transformer multicapa",
      sidebarMeta: ["5 capas de señales", "4 capas especialistas", "1 decisión explicable"],
      items: [
        { label: "Entradas", target: "inputs" },
        { label: "Atención", target: "attention" },
        { label: "Capas", target: "layers" },
        { label: "Consenso", target: "consensus" },
        { label: "Decisión", target: "decision" },
      ],
      tabs: [
        { label: "Resumen", target: "decision" },
        { label: "Capas", target: "layers" },
        { label: "Consenso", target: "consensus" },
      ],
      topLabel: "Motor de decisión",
      topTitle: "Impulsado por transformers multicapa",
      topDate: "22 abr",
      topStatus: "Resumen actualizado",
      ask: "Pregunta: ¿qué capas cambiaron la decisión?",
      leadTag: "Decisión final",
      leadTitle: "Reducir riesgo. El rebote sigue siendo demasiado frágil.",
      leadBody:
        "Las capas discrepan en valoración, pero la capa de atención da más peso al riesgo, a los flujos saturados y a tus reglas. El sistema propone una acción más pequeña en vez de aumentar exposición de forma amplia.",
      leadStats: [
        { label: "Decisión final", value: "Reducir" },
        { label: "Confianza", value: "72%" },
        { label: "Estado", value: "En revisión" },
      ],
      inputsTag: "1. Entradas",
      inputsTitle: "El motor empieza con cinco fuentes simples.",
      inputs: [
        { title: "Datos de mercado", detail: "Precio, volumen, volatilidad" },
        { title: "Fundamentos", detail: "Flujo de caja, deuda, márgenes" },
        { title: "Noticias y sentimiento", detail: "Cambio narrativo en tiempo real" },
        { title: "Tu portafolio", detail: "Posiciones, límites, exposiciones" },
        { title: "Reglas de política", detail: "Qué acciones están permitidas" },
      ],
      attentionTag: "2. Capas de atención",
      attentionTitle: "El modelo encuentra qué cambió la decisión.",
      attentionBody:
        "En simple: presta menos atención al ruido y más atención a las pocas señales que realmente cambian lo que deberías hacer.",
      layerTag: "3. Salidas por capa",
      layerTitle: "Capas especialistas prueban el mismo movimiento.",
      layerRows: [
        { label: "Capa de valoración", detail: "¿El precio es justo?", stance: "Apoya", value: "78%" },
        { label: "Capa de riesgo", detail: "¿Qué puede romperse primero?", stance: "Advierte", value: "62%" },
        { label: "Capa macro", detail: "¿El régimen ayuda?", stance: "Neutral", value: "55%" },
        { label: "Capa de flujos", detail: "¿Los compradores son reales?", stance: "Advierte", value: "71%" },
      ],
      consensusTag: "4. Agregación",
      consensusTitle: "El consenso aparece solo después de ponderar las capas.",
      consensusRows: ["Valoración", "Riesgo", "Macro", "Flujos"],
      actionTag: "5. Plan de acción",
      actionTitle: "Cómo llega la decisión al portafolio real.",
      actions: [
        { label: "Recortar", detail: "Reducir primero la posición frágil", value: "-1.5%" },
        { label: "Esperar", detail: "No aumentar riesgo amplio todavía", value: "24h" },
        { label: "Revisar", detail: "Recalcular cuando flujos y reparación coincidan", value: "Sig." },
      ],
    },
    support: [
      {
        title: "Motor de decisión estilo transformer",
        body: "El workspace lee muchas señales a la vez y permite que las importantes pesen más.",
      },
      {
        title: "Debate por capas",
        body: "Capas especialistas prueban valoración, riesgo, macro, flujos y tus propias reglas antes de decidir.",
      },
      {
        title: "Atención a lo importante",
        body: "En vez de mostrar todos los números, BLS Prime destaca las señales que cambiaron la decisión.",
      },
      {
        title: "Acción explicable",
        body: "La respuesta final viene con capas, pesos, chequeo de reglas y el próximo paso que la produjo.",
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

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [hasResolvedLanguage, language]);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandName}>{brand}</span>
        </Link>

        <div className={styles.navLinks} aria-label={copy.navAria}>
          <a href="#workspace">{copy.nav.product}</a>
          <a href="#workflow">{copy.nav.solutions}</a>
          <a href="#research">{copy.nav.research}</a>
          <a href="#cta">{copy.nav.start}</a>
          <a href="#about">{copy.nav.about}</a>
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

      <section className={styles.finalBand} id="research">
        <p className={styles.sectionTag}>{copy.research.tag}</p>
        <h2 className={styles.finalTitle}>{copy.research.title}</h2>
        <p className={styles.finalBody}>{copy.research.body}</p>

        <div className={styles.heroActions}>
          <a className={styles.btnPrimary} href="#workspace">
            {copy.research.primary}
          </a>
          <a className={styles.btnGhost} href="#cta">
            {copy.research.secondary}
          </a>
        </div>
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
      {[
        { code: "en", label: "EN" },
        { code: "es", label: "ES" },
      ].map((option) => (
        <button
          aria-label={COPY[option.code].languageName}
          aria-pressed={language === option.code}
          className={styles.languageOption}
          data-active={language === option.code}
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
            <div className={styles.previewTransformerMap} aria-label="Transformer attention map">
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
