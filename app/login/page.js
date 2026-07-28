import Link from "next/link";

import styles from "@/app/login-page.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Access your workspace",
  robots: { index: false, follow: false },
};

const DEFAULT_NEXT = "/app#holdings";

const COPY = {
  en: {
    back: "Back to BLS Prime",
    eyebrow: "Investment decision workspace",
    headline: <>Keep your research, decisions, and portfolio <em>in one place.</em></>,
    lead: "Save research, connect decisions to your portfolio, and monitor what could invalidate them.",
    benefits: [
      ["01", "Research that persists", "Saved companies, theses, and evidence stay available instead of disappearing when you close the tab."],
      ["02", "Decisions linked to the portfolio", "See what a new position does to concentration and downside before you take it."],
      ["03", "Monitoring and falsifiers", "Track the KPIs and public tests that would change your view, and when they change."],
    ],
    legalIntro: "By creating an account you accept our",
    legalAnd: "and",
    legalTerms: "Terms",
    legalPrivacy: "Privacy Policy",
    legalStored: "We store your name, email, a hashed password, and the holdings you enter. We do not sell your data.",
    signupEyebrow: "Create workspace",
    signinEyebrow: "Welcome back",
    signupTitle: "Create your account",
    signinTitle: "Sign in to your workspace",
    signupSub: "Your account opens directly on the risk panel; add holdings first if the portfolio is empty.",
    signinSub: "Sign in and continue directly to the risk panel.",
    name: "Name",
    namePlaceholder: "Your name",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "Minimum 8 characters",
    create: "Create account",
    signIn: "Sign in",
    switchToSignIn: "I already have an account",
    switchToSignup: "Create a new account",
    forgotPassword: "Forgot password?",
    aurora: "Use AURORA without account",
    errors: {
      account_exists: "An account already exists for this email. Sign in instead.",
      invalid_credentials: "Check your email and password, then try again.",
      needs_password: "This account still needs a password. Use Create account to finish setup.",
      service_unavailable: "The workspace service is not reachable right now. Please try again later.",
      not_configured: "The workspace is not fully configured yet. Please contact the administrator.",
      validation: "Check the fields and try again.",
      generic: "Could not sign in. Please try again.",
      upgrade: "Your plan needs access to continue.",
    },
  },
  es: {
    back: "Volver a BLS Prime",
    eyebrow: "Espacio de decisión de inversión",
    headline: <>Tu investigación, tus decisiones y tu cartera <em>en un solo lugar.</em></>,
    lead: "Guarda investigaciones, conecta decisiones con tu cartera y monitorea qué podría invalidarlas.",
    benefits: [
      ["01", "Investigación que persiste", "Empresas guardadas, tesis y evidencia siguen disponibles en vez de perderse al cerrar la pestaña."],
      ["02", "Decisiones ligadas a la cartera", "Mira qué le hace una posición nueva a tu concentración y a tu pérdida potencial antes de tomarla."],
      ["03", "Monitoreo y falsificadores", "Sigue los KPI y las pruebas públicas que cambiarían tu lectura, y cuándo cambian."],
    ],
    legalIntro: "Al crear una cuenta aceptas nuestros",
    legalAnd: "y la",
    legalTerms: "Términos",
    legalPrivacy: "Política de Privacidad",
    legalStored: "Guardamos tu nombre, tu correo, una contraseña cifrada y las posiciones que ingreses. No vendemos tus datos.",
    signupEyebrow: "Crear workspace",
    signinEyebrow: "Bienvenido de vuelta",
    signupTitle: "Crea tu cuenta",
    signinTitle: "Entra a tu workspace",
    signupSub: "Tu cuenta abre directo en el panel de riesgo; si la cartera está vacía, primero agrega posiciones.",
    signinSub: "Inicia sesión y continúa directo al panel de riesgo.",
    name: "Nombre",
    namePlaceholder: "Tu nombre",
    email: "Email",
    password: "Contraseña",
    passwordPlaceholder: "Mínimo 8 caracteres",
    create: "Crear cuenta",
    signIn: "Iniciar sesión",
    switchToSignIn: "Ya tengo cuenta",
    switchToSignup: "Crear una cuenta nueva",
    forgotPassword: "Olvidé mi contraseña",
    aurora: "Usar AURORA sin cuenta",
    errors: {
      account_exists: "Ya existe una cuenta con ese email. Inicia sesión.",
      invalid_credentials: "Revisa tu email y contraseña, e intenta de nuevo.",
      needs_password: "Esta cuenta todavía necesita contraseña. Usa Crear cuenta para terminar la configuración.",
      service_unavailable: "El servicio del workspace no está disponible ahora. Intenta de nuevo más tarde.",
      not_configured: "El workspace todavía no está completamente configurado. Contacta al administrador.",
      validation: "Revisa los campos e intenta de nuevo.",
      generic: "No se pudo iniciar sesión. Intenta de nuevo.",
      upgrade: "Tu plan necesita acceso para continuar.",
    },
  },
};

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value) {
  const raw = String(firstValue(value) || DEFAULT_NEXT);
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : DEFAULT_NEXT;
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

function loginErrorMessage(value, copy) {
  const code = String(firstValue(value) || "").trim().toLowerCase();
  if (!code) return "";
  return copy.errors?.[code] || copy.errors?.generic || "";
}

export default function LoginPage({ searchParams = {} }) {
  const next = safeNext(searchParams.next);
  const intent = safeIntent(searchParams.intent || searchParams.mode);
  const language = safeLanguage(searchParams.lang);
  const copy = COPY[language];
  const isSignup = intent === "signup";
  const error = loginErrorMessage(searchParams.error, copy);

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

            <p className={styles.legalNote}>
              {copy.legalIntro}{" "}
              <Link href={`/terms?lang=${language}`}>{copy.legalTerms}</Link> {copy.legalAnd}{" "}
              <Link href={`/privacy?lang=${language}`}>{copy.legalPrivacy}</Link>.
              {isSignup ? <> {copy.legalStored}</> : null}
            </p>
          </form>

          <div className={styles.metaRow}>
            <Link className={styles.textLink} href={switchHref(intent, next, language)}>
              {isSignup ? copy.switchToSignIn : copy.switchToSignup}
            </Link>
            {!isSignup ? (
              <Link className={styles.textLink} href={`/forgot-password?lang=${language}`}>
                {copy.forgotPassword}
              </Link>
            ) : null}
            <Link className={styles.textLink} href="/aurora">
              {copy.aurora}
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
