import Link from "next/link";

import styles from "@/app/login-page.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

const COPY = {
  en: {
    back: "Back to sign in",
    eyebrow: "Reset password",
    headline: "Set a new password and get back in.",
    lead: "This secure link lets you replace the old password and sign back into your workspace right away.",
    title: "Create your new password",
    sub: "Use at least 8 characters. After saving it, you will be signed in automatically.",
    missingToken: "This reset link is missing its token. Request a new link before continuing.",
    password: "New password",
    confirm: "Confirm password",
    save: "Save new password",
    errors: {
      mismatch: "The passwords do not match.",
      invalid_token: "This reset link is invalid or has expired. Request a new one.",
      validation: "Use at least 8 characters and try again.",
      service_unavailable: "The service is not reachable right now. Please try again later.",
      generic: "Could not reset the password. Please try again.",
    },
  },
  es: {
    back: "Volver a iniciar sesión",
    eyebrow: "Restablecer contraseña",
    headline: "Crea una nueva contraseña y vuelve a entrar.",
    lead: "Este enlace seguro te permite reemplazar la contraseña anterior y volver a tu espacio de trabajo.",
    title: "Crea tu nueva contraseña",
    sub: "Usa al menos 8 caracteres. Después de guardarla, entrarás automáticamente.",
    missingToken: "A este enlace le falta el token. Pide un nuevo enlace antes de continuar.",
    password: "Nueva contraseña",
    confirm: "Confirmar contraseña",
    save: "Guardar nueva contraseña",
    errors: {
      mismatch: "Las contraseñas no coinciden.",
      invalid_token: "Este enlace es inválido o expiró. Pide uno nuevo.",
      validation: "Usa al menos 8 caracteres e intenta de nuevo.",
      service_unavailable: "El servicio no está disponible ahora. Intenta más tarde.",
      generic: "No se pudo restablecer la contraseña. Intenta de nuevo.",
    },
  },
};

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeLanguage(value) {
  return String(firstValue(value) || "").toLowerCase() === "en" ? "en" : "es";
}

export default function ResetPasswordPage({ searchParams = {} }) {
  const language = safeLanguage(searchParams.lang);
  const copy = COPY[language];
  const token = String(firstValue(searchParams.token) || "");
  const errorCode = String(firstValue(searchParams.error) || "").trim().toLowerCase();
  const error = errorCode ? copy.errors?.[errorCode] || copy.errors.generic : "";

  return (
    <main className={styles.page}>
      <section className={styles.stage}>
        <Link className={styles.backLink} href={`/login?intent=signin&lang=${language}`}>
          {copy.back}
        </Link>

        <div className={styles.copy}>
          <Link className={styles.logoMark} href="/">
            <span className={styles.logoIcon} aria-hidden="true">B</span>
            <span className={styles.logoText}>BLS Prime</span>
          </Link>
          <p className={styles.kicker}>{copy.eyebrow}</p>
          <h1 className={styles.headline}>{copy.headline}</h1>
          <p className={styles.lead}>{copy.lead}</p>
        </div>

        <section className={styles.card} aria-labelledby="reset-password-title">
          <p className={styles.cardEyebrow}>{copy.eyebrow}</p>
          <h2 className={styles.cardTitle} id="reset-password-title">{copy.title}</h2>
          <p className={styles.cardSub}>{copy.sub}</p>

          {!token ? <p className={styles.error}>{copy.missingToken}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}

          <form action="/api/auth/reset-password" className={styles.form} method="post">
            <input name="token" type="hidden" value={token} />
            <input name="lang" type="hidden" value={language} />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.password}</span>
              <input className={styles.fieldInput} disabled={!token} name="password" autoComplete="new-password" minLength={8} required type="password" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.confirm}</span>
              <input className={styles.fieldInput} disabled={!token} name="confirmPassword" autoComplete="new-password" minLength={8} required type="password" />
            </label>
            <button className={styles.btnPrimary} disabled={!token} type="submit">{copy.save}</button>
          </form>
        </section>
      </section>
    </main>
  );
}
