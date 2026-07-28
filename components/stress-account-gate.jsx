"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";

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
    eyebrow: "Espacio de cartera",
    title: "Stress necesita tus posiciones primero.",
    body: "Crea una cuenta o inicia sesión, agrega tus posiciones y abre el panel de riesgo para correr el motor sobre la cartera que realmente tienes.",
    create: "Crear cuenta",
    signIn: "Iniciar sesión",
    aurora: "Usar AURORA sin cuenta",
    close: "Cerrar",
  },
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function authHref(intent, requestedLanguage) {
  const language = requestedLanguage === "en" ? "en" : "es";
  return `/login?intent=${intent}&lang=${language}&next=${encodeURIComponent(PORTFOLIO_WORKSPACE_HREF)}`;
}

export function StressAccountGate({ children, className = "", language = "es" }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef(null);
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const copy = COPY[language] || COPY.es;

  useEffect(() => {
    if (!open) return undefined;

    const bodyChildren = Array.from(document.body.children)
      .filter((node) => node !== overlayRef.current && !["SCRIPT", "STYLE"].includes(node.tagName));
    const previousStates = bodyChildren.map((node) => ({
      node,
      inert: Boolean(node.inert),
      ariaHidden: node.getAttribute("aria-hidden"),
    }));
    const previousOverflow = document.body.style.overflow;

    closeRef.current?.focus();
    for (const node of bodyChildren) {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
          .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const state of previousStates) {
        state.node.inert = state.inert;
        if (state.ariaHidden === null) state.node.removeAttribute("aria-hidden");
        else state.node.setAttribute("aria-hidden", state.ariaHidden);
      }
      triggerRef.current?.focus();
    };
  }, [open]);

  const dialog = open && typeof document !== "undefined"
    ? createPortal(
      <div
        className={styles.overlay}
        data-stress-account-gate
        onMouseDown={() => setOpen(false)}
        ref={overlayRef}
        role="presentation"
      >
        <section
          aria-labelledby={titleId}
          aria-modal="true"
          className={styles.modal}
          onMouseDown={(event) => event.stopPropagation()}
          ref={dialogRef}
          role="dialog"
        >
          <button
            aria-label={copy.close}
            className={styles.closeButton}
            onClick={() => setOpen(false)}
            ref={closeRef}
            type="button"
          >
            {"×"}
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
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        {children}
      </button>
      {dialog}
    </>
  );
}
