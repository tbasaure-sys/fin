"use client";

import { useState } from "react";
import Link from "next/link";
import LivingCasesPanel from "./living-cases-panel";
import styles from "./private-carteras-dashboard.module.css";

const money = (value) => value === null || !Number.isFinite(Number(value))
  ? "Sin precio guardado"
  : new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
const date = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value)) : "Sin fecha";

export default function PrivateCarterasDashboard({ initialData, user }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/carteras/dashboard", { cache: "no-store", credentials: "same-origin" });
      if (response.ok) setData(await response.json());
    } finally { setBusy(false); }
  }
  const holdings = data?.holdings || [];
  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div><span className={styles.eyebrow}>BLS Prime · privado</span><h1>Mi cartera</h1><p>Solo las posiciones de tu espacio privado.</p></div>
      <div className={styles.topActions}><span>{user?.name || "Sesión privada"}</span><Link href="/app">Volver al workspace</Link></div>
    </header>
    {data?.status !== "available" ? <section className={styles.riskPanel} role="status"><h2>No pudimos leer tu cartera</h2><p>La conexión privada con Neon no está disponible. Tus posiciones no se sustituyen por datos de otra cuenta.</p></section> : <>
      <div className={styles.controls}>
        <div><span>Valor con precio guardado</span><strong> {money(data.totalKnownUsd)}</strong><small> {data.pricedCount}/{holdings.length} posiciones con valoración · datos guardados al {date(data.asOf)}</small></div>
        <div className={styles.topActions}><button type="button" onClick={refresh} disabled={busy}>{busy ? "Actualizando…" : "Actualizar"}</button><Link href="/app#holdings">Administrar posiciones</Link></div>
      </div>
      {holdings.length ? <div className={styles.matrixWrap}>
        <table className={styles.matrix} aria-label="Mis posiciones guardadas">
          <thead><tr><th>Empresa</th><th>Cantidad</th><th>Valor guardado</th><th>Peso conocido</th><th>Investigación</th></tr></thead>
          <tbody>{holdings.map((row) => <tr key={row.ticker}>
            <th>{row.ticker}</th><td>{row.quantity ?? "N/D"}</td><td>{money(row.recordedValueUsd)}</td>
            <td>{row.weightOfKnown === null ? "N/D" : `${(row.weightOfKnown * 100).toFixed(1)} %`}</td>
            <td><Link href={`/research?ticker=${encodeURIComponent(row.ticker)}&view=thesis&lang=es`}>Abrir tesis</Link></td>
          </tr>)}</tbody>
        </table>
      </div> : <section className={styles.riskPanel}><h2>Tu cartera está vacía</h2><p>Agrega posiciones en el workspace para guardarlas en Neon y seguirlas aquí.</p><Link href="/app#holdings">Agregar posiciones</Link></section>}
      {data.pricedCount !== holdings.length ? <p>El valor es parcial: las posiciones sin precio guardado no se incluyen en el total.</p> : null}
    </>}
    <LivingCasesPanel holdings={holdings} />
    <footer className={styles.footer}>Datos privados del workspace en Neon. Los precios se muestran con su última fecha guardada. Sin órdenes ni ejecución.</footer>
  </main>;
}
