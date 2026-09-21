"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./research.module.css";

export function TickerSearch({
  language = "es",
  initialTicker = "",
  home = false,
}) {
  const router = useRouter(),
    [ticker, setTicker] = useState(initialTicker),
    [error, setError] = useState(false);
  const en = language === "en";
  return (
    <form
      className={styles.search}
      action="/research"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        const symbol = String(
          new FormData(event.currentTarget).get("ticker") || "",
        )
          .trim()
          .toUpperCase();
        if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
          setError(true);
          return;
        }
        setError(false);
        router.push(
          `/research?ticker=${encodeURIComponent(symbol)}&lang=${language}`,
        );
      }}
    >
      <input type="hidden" name="lang" value={language} />
      <label htmlFor={home ? "home-ticker" : "research-ticker"}>
        {en ? "Company ticker" : "Ticker de la empresa"}
      </label>
      <div className={styles.searchRow}>
        <input
          name="ticker"
          id={home ? "home-ticker" : "research-ticker"}
          value={ticker}
          onChange={(e) => {
            setTicker(e.target.value);
            setError(false);
          }}
          placeholder="MSFT, AAPL, BRK.B…"
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error}
          aria-describedby={error ? "ticker-error" : undefined}
        />
        <button type="submit">
          {home
            ? en
              ? "Research company"
              : "Investigar empresa"
            : en
              ? "Open dossier"
              : "Abrir expediente"}{" "}

        </button>
      </div>
      {error ? (
        <p id="ticker-error" role="alert">
          {en
            ? "Enter a valid ticker, such as MSFT or BRK.B."
            : "Escribe un ticker válido, como MSFT o BRK.B."}
        </p>
      ) : null}
    </form>
  );
}
