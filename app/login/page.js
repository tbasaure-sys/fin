import Link from "next/link";

import styles from "@/app/login-page.module.css";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/app#holdings";

const COPY = {
  en: {
    back: "Back to BL'S",
    eyebrow: "Portfolio workspace",
    headline: <>Run Stress on the portfolio <em>you actually own.</em></>,
    lead: "Create a private workspace, enter your holdings, then run the stress engine with an auditable footprint.",
    benefits: [
      ["01", "Holdings first", "Start with ticker, size, value, and weights instead of abstract model inputs."],
      ["02", "Charts that matter", "Allocation, performance ranges, and stress diagnostics live in the same workspace."],
      ["03", "AURORA stays open", "Valuation can still be used without an account, or launched from this workspace."],
    ],
    signupEyebrow: "Create workspace",
    signinEyebrow: "Welcome back",
    signupTitle: "Create your account",
    signinTitle: "Sign in to your workspace",
    signupSub: "Your account opens directly on holdings, where Stress Engine gets the portfolio it needs.",
    signinSub: "Sign in and continue directly to holdings.",
    name: "Name",
    namePlaceholder: "Your name",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "Minimum 8 characters",
    create: "Create account",
    signIn: "Sign in",
    switchToSignIn: "I already have an account",
    switchToSignup: "Create a new account",
    aurora: "Use AURORA without account",
  },
  es: {
    back: "Volver a BL'S",
    eyebrow: "Workspace de cartera",
    headline: <>Corre Stress sobre la cartera <em>que realmente tienes.</em></>,
    lead: "Crea un espacio privado, ingresa tus posiciones y corre el motor con una huella auditable.",
    benefits: [
      ["01", "Posiciones primero", "Empieza con ticker, tamaño, valor y pesos en vez de inputs abstractos."],
      ["02", "Gráficos que importan", "Asignación, rangos de rendimiento y diagnóstico de stress viven en el mismo espacio."],
      ["03", "AURORA sigue abierto", "Puedes usar valoración sin cuenta o lanzarla desde el workspace."],
    ],
    signupEyebrow: "Crear workspace",
    signinEyebrow: "Bienvenido de vuelta",
    signupTitle: "Crea tu cuenta",
    signinTitle: "Entra a tu workspace",
    signupSub: "Tu cuenta abre directo en posiciones, donde Stress Engine obtiene la cartera que necesita.",
    signinSub: "Inicia sesión y continúa directo a posiciones.",
    name: "Nombre",
    namePlaceholder: "Tu nombre",
    email: "Email",
    password: "Contraseña",
    passwordPlaceholder: "Mínimo 8 caracteres",
    create: "Crear cuenta",
    signIn: "Iniciar sesión",
    switchToSignIn: "Ya tengo cuenta",
    switchToSignup: "Crear una cuenta nueva",
    aurora: "Usar AURORA sin cuenta",
  },
};

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value) {
  const raw = String(firstValue(value) || DEFAULT_NEXT);
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_NEXT;
}

function safeIntent(value) {
  return String(firstValue(value) || "signup").toLowerCase() === "signin" ? "signin" : "signup";
}

function safeLanguage(value) {
  return String(firstValue(value) || "").toLowerCase() === "en" ? "en" : "es";
}

function switchHref(intent, next, language) {
  const other = intent === "signup" ? "signin" : "signup";
  return `/login?intent=${other}&lang=${language}&next=${encodeURIComponent(next)}`;
}

export default function LoginPage({ searchParams = {} }) {
  const next = safeNext(searchParams.next);
  const intent = safeIntent(searchParams.intent || searchParams.mode);
  const language = safeLanguage(searchParams.lang);
  const copy = COPY[language];
  const isSignup = intent === "signup";
  const error = String(firstValue(searchParams.error) || "");

  return (
    <main className={styles.page}>
      <section className={styles.stage}>
        <Link className={styles.backLink} href="/">
          {copy.back}
        </Link>

        <div className={styles.copy}>
          <Link className={styles.logoMark} href="/">
            <span className={styles.logoIcon} aria-hidden="true">
              B
            </span>
            <span className={styles.logoText}>BLS Prime</span>
          </Link>
          <p className={styles.kicker}>{copy.eyebrow}</p>
          <h1 className={styles.headline}>{copy.headline}</h1>
          <p className={styles.lead}>{copy.lead}</p>
          <div className={styles.benefits}>
            {copy.benefits.map(([index, title, body]) => (
              <div className={styles.benefit} key={title}>
                <span className={styles.benefitIcon} aria-hidden="true">{index}</span>
                <div className={styles.benefitBody}>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className={styles.card} aria-labelledby="auth-title">
          <p className={styles.cardEyebrow}>{isSignup ? copy.signupEyebrow : copy.signinEyebrow}</p>
          <h2 className={styles.cardTitle} id="auth-title">
            {isSignup ? copy.signupTitle : copy.signinTitle}
          </h2>
          <p className={styles.cardSub}>{isSignup ? copy.signupSub : copy.signinSub}</p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <form action="/api/auth/login" className={styles.form} method="post">
            <input name="intent" type="hidden" value={intent} />
            <input name="lang" type="hidden" value={language} />
            <input name="next" type="hidden" value={next} />

            {isSignup ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.name}</span>
                <input className={styles.fieldInput} name="name" autoComplete="name" placeholder={copy.namePlaceholder} type="text" />
              </label>
            ) : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.email}</span>
              <input className={styles.fieldInput} name="email" autoComplete="email" placeholder="you@fund.com" required type="email" />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.password}</span>
              <input
                className={styles.fieldInput}
                name="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={8}
                placeholder={copy.passwordPlaceholder}
                required
                type="password"
              />
            </label>

            <button className={styles.btnPrimary} type="submit">
              {isSignup ? copy.create : copy.signIn}
            </button>
          </form>

          <div className={styles.metaRow}>
            <Link className={styles.textLink} href={switchHref(intent, next, language)}>
              {isSignup ? copy.switchToSignIn : copy.switchToSignup}
            </Link>
            <Link className={styles.textLink} href="/aurora">
              {copy.aurora}
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
