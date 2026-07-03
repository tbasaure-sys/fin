"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import styles from "@/components/stress-account-gate.module.css";

export const PORTFOLIO_WORKSPACE_HREF = "/app#holdings";

const COPY = {
  en: {
    eyebrow: "Portfolio workspace",
    title: "Stress needs your holdings first.",
    body: "Create an account or sign in, add your positions, then run the stress engine on the portfolio you actually own.",
    create: "Create account",
    signIn: "Sign in",
    aurora: "Use AURORA without an account",
    close: "Close",
  },
  es: {
    eyebrow: "Workspace de cartera",
    title: "Stress necesita tus posiciones primero.",
    body: "Crea una cuenta o inicia sesi\u00f3n, agrega tus posiciones y corre el motor de stress sobre la cartera que realmente tienes.",
    create: "Crear cuenta",
    signIn: "Iniciar sesi\u00f3n",
    aurora: "Usar AURORA sin cuenta",
    close: "Cerrar",
  },
};

function authHref(intent, language) {
  return `/login?intent=${intent}&lang=${language === "en" ? "en" : "es"}&next=${encodeURIComponent(PORTFOLIO_WORKSPACE_HREF)}`;
}

export function StressAccountGate({ children, className = "", language = "es" }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const copy = COPY[language] || COPY.es;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button className={className} onClick={() => setOpen(true)} type="button">
        {children}
      </button>

      {open ? (
        <div className={styles.overlay} role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.modal}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button aria-label={copy.close} className={styles.closeButton} onClick={() => setOpen(false)} type="button">
              {"\u00d7"}
            </button>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h2 id={titleId}>{copy.title}</h2>
            <p>{copy.body}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href={authHref("signup", language)}>
                {copy.create}
              </Link>
              <Link className={styles.secondary} href={authHref("signin", language)}>
                {copy.signIn}
              </Link>
            </div>
            <Link className={styles.auroraLink} href="/aurora">
              {copy.aurora}
            </Link>
          </section>
        </div>
      ) : null}
    </>
  );
}
