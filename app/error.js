"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useLanguagePreference } from "@/components/language-preference";
import styles from "@/components/status/status-page.module.css";

const COPY = {
  en: {
    kicker: "Something went wrong",
    title: "We could not load this page.",
    body: "The error was on our side, not in your data. Try again; if it keeps happening, go back home and reopen the page.",
    retry: "Try again",
    home: "Back to home",
  },
  es: {
    kicker: "Algo salió mal",
    title: "No pudimos cargar esta página.",
    body: "El error fue nuestro, no de tus datos. Vuelve a intentarlo; si se repite, regresa al inicio y abre la página de nuevo.",
    retry: "Reintentar",
    home: "Volver al inicio",
  },
};

export default function Error({ error, reset }) {
  const { language } = useLanguagePreference("es");
  const copy = COPY[language] || COPY.es;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.kicker}>{copy.kicker}</p>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.body}>{copy.body}</p>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => reset()} type="button">
            {copy.retry}
          </button>
          <Link className={styles.secondary} href={`/?lang=${language}`}>
            {copy.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
