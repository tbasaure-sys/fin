"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguagePreference } from "@/components/language-layer";
import {
  CHANNEL_STORAGE_KEY,
  createEmptyChannelAnswers,
  sanitizeChannelAnswers,
} from "@/lib/channels/contract";
import { CHANNEL_QUESTIONS } from "@/lib/channels/questions";
import { evaluateChannelProfile } from "@/lib/channels/scoring";

import styles from "./channels.module.css";

const PUBLIC_SOURCE_EXCLUSIVES = new Set(["none", "internal_private", "patient", "client"]);

const COPY = {
  es: {
    brandAria: "Volver al inicio de BL'S",
    home: "Inicio",
    signIn: "Iniciar sesión",
    language: "Elegir idioma",
    eyebrow: "CHANNEL FINDER · DIAGNÓSTICO PÚBLICO",
    title: "¿Dónde podrías ver algo antes o mejor que el mercado?",
    introduction:
      "Un canal no es una industria que te gusta. Es una observación legal, repetible y verificable que puede mostrarte un cambio antes o con más resolución que el consenso.",
    start: "Descubrir mis canales",
    time: "8 preguntas · 4 minutos",
    publicResult: "El resultado aparece sin crear una cuenta.",
    privateTitle: "Privado por defecto",
    privateBody:
      "Tus respuestas son categorías, no texto libre, y se guardan solo en este navegador. No pedimos nombres de empleadores, pacientes, clientes ni compañías relacionadas con tu trabajo.",
    legalTitle: "La frontera es explícita",
    legalBody:
      "Nunca uses información confidencial, material no público, datos de pacientes o datos privados de clientes. Si una respuesta cruza esa frontera, el diagnóstico se bloquea.",
    principle: "Primero el canal. Después la tesis. El filtro viene al final.",
    question: "Pregunta",
    of: "de",
    singleHint: "Elige una opción.",
    multiHint: (max) => `Elige hasta ${max} opciones.`,
    selected: (count, max) => `${count} de ${max} seleccionadas`,
    maxReached: "Ya alcanzaste el máximo. Quita una opción para elegir otra.",
    back: "Atrás",
    continue: "Continuar",
    finish: "Ver mi diagnóstico",
    reset: "Empezar de nuevo",
    resultEyebrow: "RESULTADO · HIPÓTESIS, NO VEREDICTO",
    resultTitle: "Tu mapa de canales",
    plausible: "Plausible · no validado",
    probeReady: "Listo para una primera prueba",
    insufficient: "Aún no aparece un canal defendible",
    blocked: "Perfil bloqueado por fuente sensible",
    score: "Puntaje de preparación",
    scoreOutOf: "de 100",
    scoreNote:
      "Este puntaje mide si el canal se puede probar. No mide retorno esperado ni recomienda una inversión.",
    dimensions: "Qué sostiene el resultado",
    hypotheses: "Canales plausibles para investigar",
    noHypotheses:
      "Tus respuestas todavía no conectan una observación pública, repetible y falsable con una variable económica de una empresa.",
    blockedTitle: "Este perfil no puede convertirse en un canal de investigación.",
    blockedBody:
      "La fuente indicada podría depender de información confidencial, de pacientes o de clientes. BLS Prime la excluye por diseño. Repite el diagnóstico usando solo observaciones públicas y legítimas.",
    blockedReason: "Motivo",
    why: "Por qué podría existir",
    observable: "Qué observarías",
    proof: "Cómo verificarlo públicamente",
    economicLink: "Vínculo económico",
    protection: "Por qué podría persistir",
    falsifier: "Primera refutación",
    probe: "Prueba de 45 minutos",
    radar: "Semilla para tu radar",
    sourceTrail: "Fuentes públicas sugeridas",
    researchOnly:
      "Avanzar significa investigar y tratar de refutar. Ningún resultado aquí es una recomendación de compra, venta o tamaño de posición.",
    saveTitle: "Conservar este mapa",
    saveBodyAnonymous:
      "Puedes verlo sin cuenta. Inicia sesión solo si quieres guardarlo en tu workspace y usarlo más adelante para construir tu radar.",
    saveBodyAuthenticated:
      "Guárdalo en tu workspace para convertir estas hipótesis en una cola de investigación.",
    save: "Guardar en mi workspace",
    saving: "Guardando…",
    saved: "Guardado en tu workspace",
    saveError: "No pudimos guardarlo. Tu copia local sigue intacta.",
    loginToSave: "Iniciar sesión para guardarlo",
    localOnly: "Guardado solo en este navegador",
    workspaceOnly: "Cargado desde tu workspace",
    localAndWorkspace: "Guardado en este navegador y en tu workspace",
    tabOnly: "Visible solo en esta pestaña",
    deleteLocal: "Borrar mi resultado local",
    deleteWorkspace: "Borrar del workspace",
    deletingWorkspace: "Borrando del workspace…",
    workspaceDeleted: "Borrado del workspace. La copia local no cambió.",
    workspaceDeleteError: "No pudimos borrar la copia del workspace.",
    deleted: "El resultado local fue eliminado.",
    sessionChecking: "Comprobando sesión…",
    dimensionLabels: {
      directExperience: "Experiencia directa",
      publicVerifiability: "Verificación pública",
      repeatability: "Repetibilidad",
      issuerKpiMapping: "Conexión con KPI",
      testability: "Capacidad de refutación",
      structuralProtection: "Protección estructural",
      timeFit: "Ajuste a tu tiempo",
    },
  },
  en: {
    brandAria: "Back to BL'S home",
    home: "Home",
    signIn: "Sign in",
    language: "Choose language",
    eyebrow: "CHANNEL FINDER · PUBLIC DIAGNOSTIC",
    title: "Where might you see something before or better than the market?",
    introduction:
      "A channel is not an industry you like. It is a lawful, repeatable, verifiable observation that may reveal change earlier or at higher resolution than consensus.",
    start: "Discover my channels",
    time: "8 questions · 4 minutes",
    publicResult: "See the result without creating an account.",
    privateTitle: "Private by default",
    privateBody:
      "Your answers are categories, not free text, and remain in this browser. We do not ask for employer, patient, client, or work-related company names.",
    legalTitle: "The boundary is explicit",
    legalBody:
      "Never use confidential or material non-public information, patient data, or private client data. If an answer crosses that line, the diagnostic stops.",
    principle: "Channel first. Thesis second. The filter comes last.",
    question: "Question",
    of: "of",
    singleHint: "Choose one option.",
    multiHint: (max) => `Choose up to ${max} options.`,
    selected: (count, max) => `${count} of ${max} selected`,
    maxReached: "You reached the limit. Remove one option to choose another.",
    back: "Back",
    continue: "Continue",
    finish: "See my diagnostic",
    reset: "Start over",
    resultEyebrow: "RESULT · HYPOTHESES, NOT A VERDICT",
    resultTitle: "Your channel map",
    plausible: "Plausible · not validated",
    probeReady: "Ready for a first probe",
    insufficient: "No defensible channel yet",
    blocked: "Profile blocked by a sensitive source",
    score: "Readiness score",
    scoreOutOf: "out of 100",
    scoreNote:
      "This score measures whether a channel can be tested. It does not estimate returns or recommend an investment.",
    dimensions: "What supports the result",
    hypotheses: "Plausible channels to investigate",
    noHypotheses:
      "Your answers do not yet connect a public, repeatable, falsifiable observation to a company-level economic variable.",
    blockedTitle: "This profile cannot become a research channel.",
    blockedBody:
      "The indicated source may depend on confidential, patient, or client information. BLS Prime excludes it by design. Repeat the diagnostic using public and lawful observations only.",
    blockedReason: "Reason",
    why: "Why it may exist",
    observable: "What you would observe",
    proof: "How to verify it publicly",
    economicLink: "Economic link",
    protection: "Why it may persist",
    falsifier: "First rejection",
    probe: "45-minute probe",
    radar: "Radar seed",
    sourceTrail: "Suggested public sources",
    researchOnly:
      "Advancing means researching and trying to reject the idea. Nothing here is a recommendation to buy, sell, or size a position.",
    saveTitle: "Keep this map",
    saveBodyAnonymous:
      "You can view it without an account. Sign in only if you want to save it to your workspace and use it later to build your radar.",
    saveBodyAuthenticated:
      "Save it to your workspace to turn these hypotheses into a research queue.",
    save: "Save to my workspace",
    saving: "Saving…",
    saved: "Saved to your workspace",
    saveError: "We could not save it. Your local copy is still intact.",
    loginToSave: "Sign in to save it",
    localOnly: "Saved only in this browser",
    workspaceOnly: "Loaded from your workspace",
    localAndWorkspace: "Saved in this browser and your workspace",
    tabOnly: "Visible only in this tab",
    deleteLocal: "Delete my local result",
    deleteWorkspace: "Delete from workspace",
    deletingWorkspace: "Deleting from workspace…",
    workspaceDeleted: "Deleted from the workspace. The local copy is unchanged.",
    workspaceDeleteError: "We could not delete the workspace copy.",
    deleted: "The local result was deleted.",
    sessionChecking: "Checking session…",
    dimensionLabels: {
      directExperience: "Direct experience",
      publicVerifiability: "Public verification",
      repeatability: "Repeatability",
      issuerKpiMapping: "KPI connection",
      testability: "Falsifiability",
      structuralProtection: "Structural protection",
      timeFit: "Time fit",
    },
  },
};

function localized(value, language) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[language] || value.es || value.en || "";
  }
  return String(value || "");
}

function localizedSource(value, language) {
  if (value && typeof value === "object") return localized(value, language);
  const sourceQuestion = CHANNEL_QUESTIONS.find((question) => question.id === "public_sources");
  const option = sourceQuestion?.options?.find((item) => item.value === value);
  return option ? localized(option.label, language) : String(value || "");
}

function maxSelectionsFor(question) {
  return Number(question?.maxSelections) || (question?.type === "multi" ? 3 : 1);
}

function questionAnswer(answers, question) {
  const value = answers?.[question.id];
  if (question.type === "multi") return Array.isArray(value) ? value : [];
  return typeof value === "string" ? value : "";
}

function hasAnswer(answers, question) {
  const answer = questionAnswer(answers, question);
  return question.type === "multi" ? answer.length > 0 : Boolean(answer);
}

function readLocalProfile() {
  try {
    const raw = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const candidate = parsed?.answers || parsed;
    const answers = sanitizeChannelAnswers(candidate);
    const result = evaluateChannelProfile(answers);
    const complete = CHANNEL_QUESTIONS.every((question) => !question.required || hasAnswer(answers, question));
    if (!complete && !result.safety?.blocked) return null;
    return { answers, result };
  } catch {
    return null;
  }
}

function writeLocalProfile(answers, result) {
  try {
    window.localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify({ answers, result }));
    return true;
  } catch {
    return false;
  }
}

function removeSaveFlagFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("save");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

function LanguageToggle({ language, setLanguage, label }) {
  return (
    <div aria-label={label} className={styles.languageToggle} role="group">
      {["es", "en"].map((code) => (
        <button
          aria-label={code === "es" ? "Español" : "English"}
          aria-pressed={language === code}
          data-active={language === code}
          key={code}
          onClick={() => setLanguage(code)}
          type="button"
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Progress({ current, total, copy }) {
  const percentage = Math.round(((current + 1) / total) * 100);
  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressCopy}>
        <span>
          {copy.question} {String(current + 1).padStart(2, "0")} {copy.of} {String(total).padStart(2, "0")}
        </span>
        <span>{percentage}%</span>
      </div>
      <div
        aria-label={`${copy.question} ${current + 1} ${copy.of} ${total}`}
        aria-valuemax={total}
        aria-valuemin="1"
        aria-valuenow={current + 1}
        className={styles.progressTrack}
        role="progressbar"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function QuestionScreen({ answers, copy, index, language, onBack, onChange, onContinue }) {
  const question = CHANNEL_QUESTIONS[index];
  const legendRef = useRef(null);
  const answer = questionAnswer(answers, question);
  const values = question.type === "multi" ? answer : answer ? [answer] : [];
  const maxSelections = maxSelectionsFor(question);
  const atMax = question.type === "multi" && values.length >= maxSelections;
  const canContinue = !question.required || values.length > 0;

  useEffect(() => {
    legendRef.current?.focus({ preventScroll: true });
  }, []);

  function choose(value) {
    if (question.type !== "multi") {
      onChange(question.id, value);
      return;
    }

    const isSelected = values.includes(value);
    let next;
    if (question.id === "public_sources") {
      if (PUBLIC_SOURCE_EXCLUSIVES.has(value)) {
        next = isSelected ? [] : [value];
      } else {
        const publicValues = values.filter((item) => !PUBLIC_SOURCE_EXCLUSIVES.has(item));
        next = isSelected ? publicValues.filter((item) => item !== value) : [...publicValues, value];
      }
    } else {
      next = isSelected ? values.filter((item) => item !== value) : [...values, value];
    }

    if (next.length <= maxSelections) onChange(question.id, next);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (canContinue) onContinue();
  }

  return (
    <form className={styles.questionLayout} onSubmit={handleSubmit}>
      <aside className={styles.questionRail}>
        <Progress copy={copy} current={index} total={CHANNEL_QUESTIONS.length} />
        <p className={styles.railPrinciple}>{copy.principle}</p>
        <div className={styles.privacyMini}>
          <span aria-hidden="true">◌</span>
          <p>{copy.privateBody}</p>
        </div>
      </aside>

      <fieldset className={styles.questionFieldset}>
        <legend ref={legendRef} tabIndex="-1">{localized(question.prompt, language)}</legend>
        <p className={styles.questionHelp}>{localized(question.help, language)}</p>
        <div className={styles.selectionMeta} aria-live="polite">
          <span>{question.type === "multi" ? copy.multiHint(maxSelections) : copy.singleHint}</span>
          {question.type === "multi" ? <strong>{copy.selected(values.length, maxSelections)}</strong> : null}
        </div>

        <div className={styles.options}>
          {question.options.map((option, optionIndex) => {
            const selected = values.includes(option.value);
            const replacesSelection = question.id === "public_sources" && PUBLIC_SOURCE_EXCLUSIVES.has(option.value);
            const disabled = question.type === "multi" && atMax && !selected && !replacesSelection;
            return (
              <label className={styles.option} data-disabled={disabled} data-selected={selected} key={option.value}>
                <input
                  checked={selected}
                  disabled={disabled}
                  name={question.id}
                  onChange={() => choose(option.value)}
                  type={question.type === "multi" ? "checkbox" : "radio"}
                  value={option.value}
                />
                <span className={styles.optionIndex}>{String(optionIndex + 1).padStart(2, "0")}</span>
                <span className={styles.optionCopy}>
                  <strong>{localized(option.label, language)}</strong>
                  <small>{localized(option.description, language)}</small>
                </span>
                <span aria-hidden="true" className={styles.optionMark}>
                  {question.type === "multi" ? "+" : "•"}
                </span>
              </label>
            );
          })}
        </div>
        {atMax ? <p className={styles.maxNotice}>{copy.maxReached}</p> : null}

        <div className={styles.questionActions}>
          <button className={styles.secondaryButton} onClick={onBack} type="button">
            <span aria-hidden="true">←</span> {copy.back}
          </button>
          <button className={styles.primaryButton} disabled={!canContinue} type="submit">
            {index === CHANNEL_QUESTIONS.length - 1 ? copy.finish : copy.continue}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function DimensionRail({ copy, result }) {
  const dimensions = Object.entries(result?.scores || {});
  if (!dimensions.length) return null;
  return (
    <section aria-labelledby="channel-dimensions" className={styles.dimensionSection}>
      <h2 id="channel-dimensions">{copy.dimensions}</h2>
      <div className={styles.dimensionList}>
        {dimensions.map(([key, value]) => {
          const score = Number(value?.score) || 0;
          const max = Math.max(1, Number(value?.max) || 1);
          return (
            <div className={styles.dimensionRow} key={key}>
              <div>
                <span>{copy.dimensionLabels[key] || key}</span>
                <strong>
                  {score}/{max}
                </strong>
              </div>
              <span className={styles.dimensionTrack}>
                <span style={{ width: `${Math.min(100, (score / max) * 100)}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Hypothesis({ copy, hypothesis, index, language }) {
  const sources = Array.isArray(hypothesis.sources) ? hypothesis.sources : [];
  return (
    <article className={styles.hypothesis}>
      <header className={styles.hypothesisHeader}>
        <span className={styles.hypothesisNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div>
          <span className={styles.stageLabel}>{copy.plausible}</span>
          <h3>{localized(hypothesis.title, language)}</h3>
          <span className={styles.summaryLabel}>{copy.why}</span>
          <p>{localized(hypothesis.summary, language)}</p>
        </div>
      </header>

      <dl className={styles.hypothesisBody}>
        <div>
          <dt>{copy.observable}</dt>
          <dd>{localized(hypothesis.observable, language)}</dd>
        </div>
        <div>
          <dt>{copy.economicLink}</dt>
          <dd>{localized(hypothesis.economicLink, language)}</dd>
        </div>
        <div>
          <dt>{copy.proof}</dt>
          <dd>{localized(hypothesis.publicProof, language)}</dd>
        </div>
        <div>
          <dt>{copy.protection}</dt>
          <dd>{localized(hypothesis.protection, language)}</dd>
        </div>
      </dl>

      <div className={styles.testStrip}>
        <div>
          <span>{copy.falsifier}</span>
          <p>{localized(hypothesis.falsifier, language)}</p>
        </div>
        <div>
          <span>{copy.probe}</span>
          <p>{localized(hypothesis.firstProbe45m, language)}</p>
        </div>
      </div>

      <div className={styles.radarStrip}>
        <span>{copy.radar}</span>
        <strong>{localized(hypothesis.radarSeed, language)}</strong>
        {sources.length ? (
          <p>
            {copy.sourceTrail}: {sources.map((source) => localizedSource(source, language)).join(" · ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ResultScreen({
  copy,
  language,
  onDelete,
  onDeleteWorkspace,
  onRestart,
  onSave,
  profileSource,
  result,
  saveStatus,
  session,
  workspaceDeleteStatus,
}) {
  const blocked = result?.status === "blocked_sensitive" || result?.safety?.blocked;
  const hypotheses = blocked ? [] : (result?.hypotheses || []).slice(0, 3);
  const statusLabel = blocked
    ? copy.blocked
    : result?.status === "probe_ready"
      ? copy.probeReady
      : result?.status === "insufficient"
        ? copy.insufficient
        : copy.plausible;
  const loginHref = `/login?lang=${language}&next=%2Fchannels%3Fsave%3D1`;
  const sourceLabel =
    profileSource === "both"
      ? copy.localAndWorkspace
      : profileSource === "workspace"
        ? copy.workspaceOnly
        : profileSource === "memory"
          ? copy.tabOnly
          : copy.localOnly;

  function markPendingSave() {
    try {
      window.sessionStorage.setItem(`${CHANNEL_STORAGE_KEY}:pending-save`, "1");
    } catch {}
  }

  return (
    <div className={styles.resultLayout}>
      <header className={styles.resultHeader}>
        <div>
          <p className={styles.eyebrow}>{copy.resultEyebrow}</p>
          <h1>{copy.resultTitle}</h1>
          <span className={styles.resultStatus} data-blocked={blocked}>
            {statusLabel}
          </span>
        </div>
        {!blocked ? (
          <>
            <div className={styles.scoreBlock}>
              <strong>{Math.round(Number(result?.score) || 0)}</strong>
              <div>
                <span>{copy.score}</span>
                <small>{copy.scoreOutOf}</small>
              </div>
            </div>
            <p className={styles.scoreNote}>{localized(result?.scoreDefinition, language) || copy.scoreNote}</p>
          </>
        ) : null}
      </header>

      {!blocked ? <DimensionRail copy={copy} result={result} /> : null}

      {blocked ? (
        <section aria-live="assertive" className={styles.blockedPanel}>
          <span aria-hidden="true" className={styles.blockedMark}>!</span>
          <div>
            <h2>{copy.blockedTitle}</h2>
            <p>{copy.blockedBody}</p>
            {(result?.safety?.reasons || []).map((reason) => (
              <p className={styles.blockedReason} key={reason.code || localized(reason.message, language)}>
                <strong>{copy.blockedReason}:</strong> {localized(reason.message, language)}
              </p>
            ))}
          </div>
        </section>
      ) : (
        <section aria-labelledby="channel-hypotheses" className={styles.hypothesesSection}>
          <div className={styles.sectionHeading}>
            <span>{String(hypotheses.length).padStart(2, "0")}</span>
            <h2 id="channel-hypotheses">{copy.hypotheses}</h2>
          </div>
          {hypotheses.length ? (
            <div className={styles.hypothesesList}>
              {hypotheses.map((hypothesis, index) => (
                <Hypothesis
                  copy={copy}
                  hypothesis={hypothesis}
                  index={index}
                  key={hypothesis.id || hypothesis.archetype || index}
                  language={language}
                />
              ))}
            </div>
          ) : (
            <p className={styles.emptyResult}>{copy.noHypotheses}</p>
          )}
        </section>
      )}

      {!blocked ? <p className={styles.researchBoundary}>{copy.researchOnly}</p> : null}

      {!blocked ? (
        <section className={styles.saveSection}>
          <div>
            <span className={styles.saveKicker}>{sourceLabel}</span>
            <h2>{copy.saveTitle}</h2>
            <p>{session?.workspace ? copy.saveBodyAuthenticated : copy.saveBodyAnonymous}</p>
          </div>
          <div className={styles.saveActions}>
            {session?.checking ? (
              <span className={styles.sessionStatus}>{copy.sessionChecking}</span>
            ) : session?.workspace ? (
              <button
                className={styles.primaryButton}
                disabled={saveStatus === "saving" || saveStatus === "saved"}
                onClick={onSave}
                type="button"
              >
                {saveStatus === "saving" ? copy.saving : saveStatus === "saved" ? copy.saved : copy.save}
              </button>
            ) : (
              <Link className={styles.primaryButton} href={loginHref} onClick={markPendingSave}>
                {copy.loginToSave} <span aria-hidden="true">→</span>
              </Link>
            )}
            {saveStatus === "error" ? <span className={styles.saveError}>{copy.saveError}</span> : null}
            {workspaceDeleteStatus === "deleted" ? (
              <span className={styles.workspaceNotice}>{copy.workspaceDeleted}</span>
            ) : null}
            {workspaceDeleteStatus === "error" ? (
              <span className={styles.saveError}>{copy.workspaceDeleteError}</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className={styles.resultActions}>
        <button className={styles.secondaryButton} onClick={onRestart} type="button">
          {copy.reset}
        </button>
        <div className={styles.deleteActions}>
          {session?.workspace && (profileSource === "workspace" || profileSource === "both") ? (
            <button
              className={styles.deleteButton}
              disabled={workspaceDeleteStatus === "deleting"}
              onClick={onDeleteWorkspace}
              type="button"
            >
              {workspaceDeleteStatus === "deleting" ? copy.deletingWorkspace : copy.deleteWorkspace}
            </button>
          ) : null}
          {profileSource === "local" || profileSource === "both" ? (
            <button className={styles.deleteButton} onClick={onDelete} type="button">
              {copy.deleteLocal}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChannelQuestionnaire() {
  const { language, setLanguage } = useLanguagePreference();
  const copy = COPY[language] || COPY.es;
  const [stage, setStage] = useState("intro");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState(() => createEmptyChannelAnswers());
  const [result, setResult] = useState(null);
  const [session, setSession] = useState({ checking: true, workspace: null });
  const [saveStatus, setSaveStatus] = useState("idle");
  const [workspaceDeleteStatus, setWorkspaceDeleteStatus] = useState("idle");
  const [profileSource, setProfileSource] = useState(null);
  const [notice, setNotice] = useState("");
  const autoSaveAttempted = useRef(false);

  const saveToWorkspace = useCallback(async () => {
    if (!session.workspace?.id || !result) return false;
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(session.workspace.id)}/channels`, {
        body: JSON.stringify({ answers: sanitizeChannelAnswers(answers) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      setSaveStatus("saved");
      setWorkspaceDeleteStatus("idle");
      setProfileSource((current) => (current === "local" || current === "both" ? "both" : "workspace"));
      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }, [answers, result, session.workspace]);

  useEffect(() => {
    const stored = readLocalProfile();
    if (stored) {
      setAnswers(stored.answers);
      setResult(stored.result);
      setProfileSource("local");
      setStage("result");
    }

    let active = true;
    fetch("/api/v1/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setSession({ checking: false, workspace: null });
          return;
        }
        const payload = await response.json();
        const workspace = payload?.workspace || null;
        if (!active) return;
        setSession({ checking: false, workspace });

        if (!stored && workspace?.id) {
          const profileResponse = await fetch(
            `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/channels`,
            { cache: "no-store" },
          ).catch(() => null);
          if (!active || !profileResponse?.ok) return;
          const profilePayload = await profileResponse.json().catch(() => null);
          if (!active || !profilePayload?.profile?.answers) return;
          const restoredAnswers = sanitizeChannelAnswers(profilePayload.profile.answers);
          const restoredResult = evaluateChannelProfile(restoredAnswers);
          setAnswers(restoredAnswers);
          setResult(restoredResult);
          setProfileSource("workspace");
          setSaveStatus("saved");
          setStage("result");
        }
      })
      .catch(() => {
        if (active) setSession({ checking: false, workspace: null });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (autoSaveAttempted.current || session.checking || !session.workspace || !result) return;
    const shouldSave = new URLSearchParams(window.location.search).get("save") === "1";
    if (!shouldSave) return;
    let pendingSave = false;
    try {
      pendingSave = window.sessionStorage.getItem(`${CHANNEL_STORAGE_KEY}:pending-save`) === "1";
    } catch {}
    if (!pendingSave) {
      autoSaveAttempted.current = true;
      removeSaveFlagFromUrl();
      return;
    }
    autoSaveAttempted.current = true;
    void saveToWorkspace().finally(() => {
      try {
        window.sessionStorage.removeItem(`${CHANNEL_STORAGE_KEY}:pending-save`);
      } catch {}
      removeSaveFlagFromUrl();
    });
  }, [result, saveToWorkspace, session]);

  const currentQuestion = useMemo(() => CHANNEL_QUESTIONS[questionIndex], [questionIndex]);

  function start() {
    setNotice("");
    setSaveStatus("idle");
    setWorkspaceDeleteStatus("idle");
    setQuestionIndex(0);
    setStage("question");
  }

  function changeAnswer(id, value) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }

  function goBack() {
    if (questionIndex === 0) {
      setStage("intro");
      return;
    }
    setQuestionIndex((current) => current - 1);
  }

  function goForward() {
    if (!currentQuestion || (currentQuestion.required && !hasAnswer(answers, currentQuestion))) return;
    const stopForSafety =
      (currentQuestion.id === "source_safety" && answers.source_safety !== "public_safe") ||
      (currentQuestion.id === "public_sources" &&
        answers.public_sources.some((source) => ["internal_private", "patient", "client"].includes(source)));
    if (stopForSafety) {
      finishQuestionnaire(answers);
      return;
    }
    if (questionIndex < CHANNEL_QUESTIONS.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    finishQuestionnaire(answers);
  }

  function finishQuestionnaire(nextAnswers) {
    const sanitized = sanitizeChannelAnswers(nextAnswers);
    const evaluated = evaluateChannelProfile(sanitized);
    setAnswers(sanitized);
    setResult(evaluated);
    const savedLocally = writeLocalProfile(sanitized, evaluated);
    setProfileSource(savedLocally ? "local" : "memory");
    setSaveStatus("idle");
    setStage("result");
    window.scrollTo({ behavior: "auto", top: 0 });
  }

  function restart() {
    setAnswers(createEmptyChannelAnswers());
    setResult(null);
    setSaveStatus("idle");
    setWorkspaceDeleteStatus("idle");
    setProfileSource(null);
    setQuestionIndex(0);
    setStage("question");
    try {
      window.localStorage.removeItem(CHANNEL_STORAGE_KEY);
    } catch {}
    window.scrollTo({ behavior: "auto", top: 0 });
  }

  function deleteLocal() {
    try {
      window.localStorage.removeItem(CHANNEL_STORAGE_KEY);
      window.sessionStorage.removeItem(`${CHANNEL_STORAGE_KEY}:pending-save`);
    } catch {}
    setAnswers(createEmptyChannelAnswers());
    setResult(null);
    setSaveStatus("idle");
    setWorkspaceDeleteStatus("idle");
    setProfileSource(null);
    setNotice(copy.deleted);
    setStage("intro");
    window.scrollTo({ behavior: "auto", top: 0 });
  }

  async function deleteWorkspaceProfile() {
    if (!session.workspace?.id) return;
    setWorkspaceDeleteStatus("deleting");
    try {
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(session.workspace.id)}/channels`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      setWorkspaceDeleteStatus("deleted");
      setSaveStatus("idle");
      setProfileSource((current) =>
        current === "both" ? "local" : current === "workspace" ? "memory" : current,
      );
    } catch {
      setWorkspaceDeleteStatus("error");
    }
  }

  return (
    <main className={`${styles.page} channels-route`} data-no-translate>
      <header className={styles.topbar}>
        <Link aria-label={copy.brandAria} className={styles.logo} href="/">
          BL&apos;S
        </Link>
        <div className={styles.topActions}>
          <Link className={styles.homeLink} href="/">
            {copy.home}
          </Link>
          <LanguageToggle label={copy.language} language={language} setLanguage={setLanguage} />
          <Link className={styles.loginLink} href={`/login?lang=${language}`}>
            {copy.signIn}
          </Link>
        </div>
      </header>

      {stage === "intro" ? (
        <section aria-labelledby="channel-title" className={styles.intro}>
          <div className={styles.introMain}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="channel-title">{copy.title}</h1>
            <p className={styles.introduction}>{copy.introduction}</p>
            <div className={styles.introAction}>
              <button className={styles.primaryButton} onClick={start} type="button">
                {copy.start} <span aria-hidden="true">→</span>
              </button>
              <span>{copy.time}</span>
            </div>
            <p className={styles.publicResult}>{copy.publicResult}</p>
            {notice ? <p aria-live="polite" className={styles.notice}>{notice}</p> : null}
          </div>

          <aside className={styles.introRail}>
            <div className={styles.railRule}>
              <span>01</span>
              <div>
                <h2>{copy.privateTitle}</h2>
                <p>{copy.privateBody}</p>
              </div>
            </div>
            <div className={styles.railRule}>
              <span>02</span>
              <div>
                <h2>{copy.legalTitle}</h2>
                <p>{copy.legalBody}</p>
              </div>
            </div>
            <blockquote>{copy.principle}</blockquote>
          </aside>
        </section>
      ) : null}

      {stage === "question" && currentQuestion ? (
        <QuestionScreen
          answers={answers}
          copy={copy}
          index={questionIndex}
          key={questionIndex}
          language={language}
          onBack={goBack}
          onChange={changeAnswer}
          onContinue={goForward}
        />
      ) : null}

      {stage === "result" && result ? (
        <ResultScreen
          copy={copy}
          language={language}
          onDelete={deleteLocal}
          onDeleteWorkspace={deleteWorkspaceProfile}
          onRestart={restart}
          onSave={saveToWorkspace}
          profileSource={profileSource}
          result={result}
          saveStatus={saveStatus}
          session={session}
          workspaceDeleteStatus={workspaceDeleteStatus}
        />
      ) : null}

      <footer className={styles.footer}>
        <span>BLS Prime · {language === "es" ? "Software de investigación. No es asesoría financiera." : "Research software. Not financial advice."}</span>
        <Link href="/terms">{language === "es" ? "Términos" : "Terms"}</Link>
      </footer>
    </main>
  );
}
