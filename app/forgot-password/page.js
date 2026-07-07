import Link from "next/link";

import styles from "@/app/login-page.module.css";

export const dynamic = "force-dynamic";

const COPY = {
  en: {
    back: "Back to sign in",
    eyebrow: "Password recovery",
    headline: "Recover access to your workspace.",
    lead: "Enter your email and we will send a secure link so you can set a new password without support.",
    title: "Get your recovery link",
    sub: "If the account exists, the reset instructions will be sent. For privacy, we do not reveal whether an email is registered.",
    email: "Email",
    send: "Send reset link",
    sent: "If the account exists, the reset instructions are on the way.",
    errorFallback: "Could not start password recovery. Check the email and try again.",
    devLink: "Development reset link",
    errors: {
      validation: "Enter a valid email address and try again.",
      service_unavailable: "The service is not reachable right now. Please try again later.",
      not_configured: "The workspace is not fully configured yet. Please contact the administrator.",
    },
  },
  es: {
    back: "Volver a iniciar sesión",
    eyebrow: "Recuperación de contraseña",
    headline: "Recupera el acceso a tu espacio de trabajo.",
    lead: "Ingresa tu email y enviaremos un enlace seguro para crear una nueva contraseña sin soporte.",
    title: "Recibe tu enlace de recuperación",
    sub: "Si la cuenta existe, enviaremos las instrucciones. Por privacidad, no revelamos si el email está registrado.",
    email: "Email",
    send: "Enviar enlace de recuperación",
    sent: "Si la cuenta existe, las instrucciones de recuperación van en camino.",
    errorFallback: "No se pudo iniciar la recuperación. Revisa el email e intenta de nuevo.",
    devLink: "Enlace de desarrollo",
    errors: {
      validation: "Ingresa un email válido e intenta de nuevo.",
      service_unavailable: "El servicio no está disponible ahora. Intenta más tarde.",
      not_configured: "El workspace todavía no está completamente configurado. Contacta al administrador.",
    },
  },
};

function safeDevResetPath(value) {
  const raw = String(value || "");
  return raw.startsWith("/reset-password") && !raw.startsWith("//") ? raw : "";
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeLanguage(value) {
  return String(firstValue(value) || "").toLowerCase() === "en" ? "en" : "es";
}

export default function ForgotPasswordPage({ searchParams = {} }) {
  const language = safeLanguage(searchParams.lang);
  const copy = COPY[language];
  const sent = firstValue(searchParams.sent) === "1";
  const errorCode = String(firstValue(searchParams.error) || "").trim().toLowerCase();
  const error = errorCode ? copy.errors?.[errorCode] || copy.errorFallback : "";
  const devResetUrl = safeDevResetPath(firstValue(searchParams.devResetUrl));

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

        <section className={styles.card} aria-labelledby="password-recovery-title">
          <p className={styles.cardEyebrow}>{copy.eyebrow}</p>
          <h2 className={styles.cardTitle} id="password-recovery-title">{copy.title}</h2>
          <p className={styles.cardSub}>{copy.sub}</p>

          {sent ? <p className={styles.success}>{copy.sent}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {devResetUrl ? (
            <p className={styles.success}>
              {copy.devLink}: <Link className={styles.textLink} href={devResetUrl}>{devResetUrl}</Link>
            </p>
          ) : null}

          <form action="/api/auth/forgot-password" className={styles.form} method="post">
            <input name="lang" type="hidden" value={language} />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.email}</span>
              <input className={styles.fieldInput} name="email" autoComplete="email" placeholder="you@fund.com" required type="email" />
            </label>
            <button className={styles.btnPrimary} type="submit">{copy.send}</button>
          </form>
        </section>
      </section>
    </main>
  );
}
