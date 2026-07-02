"use client";

import { useEffect, useId, useRef, useState } from "react";

import { getGlossaryEntry } from "@/lib/copy/glossary";

import styles from "./info-tip.module.css";

export function InfoTip({ children, className = "", definitionKey, language = "en", label }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef(null);
  const entry = definitionKey ? getGlossaryEntry(definitionKey, language) : null;
  const content = children || entry?.definition;
  const displayLabel = label || entry?.term || "More information";

  useEffect(() => {
    if (!open) return undefined;

    function handleKeydown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  if (!content) return null;

  return (
    <span className={`${styles.root} ${className}`} ref={rootRef}>
      <button
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        aria-label={displayLabel}
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        i
      </button>
      {open ? (
        <span className={styles.panel} id={id} role="tooltip">
          {content}
        </span>
      ) : null}
    </span>
  );
}
