import Link from "next/link";
import { headers } from "next/headers";

import styles from "@/app/public-home.module.css";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return {
    title: locale === "en" ? "Privacy Policy" : "Política de Privacidad",
    description: locale === "en"
      ? "What BLS Prime stores, why, and which privacy controls are currently available."
      : "Qué guarda BLS Prime, por qué y qué controles de privacidad están disponibles hoy.",
    alternates: {
      canonical: "/privacy",
      languages: { es: "/privacy?lang=es", en: "/privacy?lang=en" },
    },
  };
}

const COPY = {
  en: {
    home: "Home",
    terms: "Terms",
    tag: "Privacy Policy",
    title: "What we store, and what we do not.",
    intro: (brand) => `This page describes the data flows implemented in ${brand} today, why the data is needed, and which controls are currently available. When a control is not yet self-service, we say so.`,
    effective: "Effective date: July 27, 2026",
    sections: [
      [
        "1. Account data",
        "To create a workspace we store your name, email address, and a hashed password. Passwords are never stored in readable form. Email is used to sign you in, reset your password, and send service notices about your account. The application does not sell it or use it for third-party advertising.",
      ],
      [
        "2. Portfolio holdings",
        "Positions you enter or import are stored against your workspace so the risk and portfolio views can be rebuilt between sessions. Workspace access checks keep one account from reading another account's portfolio. The current workspace lets you edit or replace stored positions; it does not yet provide self-service account deletion.",
      ],
      [
        "3. Research and decision history",
        "Analyses you run, saved companies, theses, and decision journal entries are stored so the product can show how a view changed over time. Public first readings run without an account are stored without an account identifier and are not linked to a user profile.",
      ],
      [
        "4. External data and AI providers",
        "Company analysis sends the ticker being studied to configured market and filing providers. When you use portfolio chat with a configured AI provider, the request includes your question, recent chat history, and a summary of holdings, weights, alerts, and workspace context. The application does not deliberately add your name or email to that prompt. The external provider processes what is sent under its own terms and retention controls.",
      ],
      [
        "5. Technical data",
        "The application and its hosting platform may record IP address, timestamp, requested route, and error codes to operate the service, apply rate limits, and diagnose failures. The application does not define how long the hosting platform retains those records; platform settings and provider terms control that period. The application code does not use these records to build a marketing profile.",
      ],
      [
        "6. Cookies and local storage",
        "We use a session cookie to keep you signed in and a preference key to remember your language. The application code does not install third-party advertising or cross-site tracking cookies.",
      ],
      [
        "7. Retention and deletion",
        "Account and workspace records remain stored while the account is active. The product does not yet offer self-service account deletion. You can request access to or deletion of your data through the configured privacy contact below; the request is handled manually and its scope and timing must be confirmed before processing. Records required by law or still present in provider backups may follow a different retention period.",
      ],
      [
        "8. Your choices",
        "You may use the public first reading without creating an account. You may use the workspace without entering real holdings. Any feature that requires an account is labeled as such before you click it.",
      ],
      [
        "9. Changes and contact",
        (contact) => contact
          ? `If this policy changes materially, we will update the effective date. A service notice may also be sent when email delivery is configured. For privacy questions or a data request, contact ${contact}.`
          : "If this policy changes materially, we will update the effective date. A service notice may also be sent when email delivery is configured. No verified privacy address is configured for this deployment yet; do not send personal data to an address that is not shown here.",
      ],
    ],
  },
  es: {
    home: "Inicio",
    terms: "Términos",
    tag: "Política de Privacidad",
    title: "Qué guardamos y qué no.",
    intro: (brand) => `Esta página describe los flujos de datos implementados hoy en ${brand}, por qué son necesarios y qué controles están disponibles. Cuando un control todavía no es autoservicio, lo decimos.`,
    effective: "Vigente desde el 27 de julio de 2026",
    sections: [
      [
        "1. Datos de cuenta",
        "Para crear un espacio de trabajo guardamos tu nombre, tu correo electrónico y una contraseña cifrada con hash. Las contraseñas nunca se almacenan en forma legible. El correo se usa para iniciar sesión, restablecer la contraseña y enviar avisos de servicio sobre tu cuenta. La aplicación no lo vende ni lo usa para publicidad de terceros.",
      ],
      [
        "2. Posiciones de cartera",
        "Las posiciones que ingresas o importas se guardan asociadas a tu espacio de trabajo para reconstruir las vistas de riesgo y cartera entre sesiones. Los controles de acceso impiden que una cuenta lea la cartera de otra. El espacio actual permite editar o reemplazar posiciones guardadas; todavía no ofrece eliminación autoservicio de la cuenta.",
      ],
      [
        "3. Investigación e historial de decisiones",
        "Los análisis que ejecutas, las empresas guardadas, las tesis y las entradas del registro de decisiones se almacenan para que el producto pueda mostrar cómo cambió una lectura a lo largo del tiempo. Las primeras lecturas públicas ejecutadas sin cuenta se guardan sin un identificador de cuenta y no se vinculan a un perfil de usuario.",
      ],
      [
        "4. Proveedores externos de datos e IA",
        "El análisis de empresa envía el ticker estudiado a los proveedores configurados de mercado e información regulatoria. Cuando usas el chat de cartera con un proveedor de IA configurado, la solicitud incluye tu pregunta, el historial reciente del chat y un resumen de posiciones, pesos, alertas y contexto del espacio. La aplicación no agrega deliberadamente tu nombre ni tu correo a ese prompt. El proveedor externo procesa lo enviado según sus propios términos y controles de retención.",
      ],
      [
        "5. Datos técnicos",
        "La aplicación y su plataforma de alojamiento pueden registrar dirección IP, marca de tiempo, ruta solicitada y códigos de error para operar el servicio, aplicar límites de uso y diagnosticar fallos. La aplicación no define cuánto tiempo conserva esos registros la plataforma de alojamiento; ese período depende de su configuración y sus términos. El código de la aplicación no usa estos registros para construir un perfil comercial.",
      ],
      [
        "6. Cookies y almacenamiento local",
        "Usamos una cookie de sesión para mantenerte con sesión iniciada y una clave de preferencia para recordar tu idioma. El código de la aplicación no instala cookies de publicidad de terceros ni de seguimiento entre sitios.",
      ],
      [
        "7. Conservación y eliminación",
        "Los registros de cuenta y del espacio se conservan mientras la cuenta esté activa. El producto todavía no ofrece eliminación autoservicio de la cuenta. Puedes solicitar acceso o eliminación de tus datos mediante el contacto de privacidad configurado abajo; la solicitud se procesa manualmente y su alcance y plazo deben confirmarse antes de ejecutarla. Los registros exigidos por ley o aún presentes en respaldos de proveedores pueden tener otro período de retención.",
      ],
      [
        "8. Tus opciones",
        "Puedes usar la primera lectura pública sin crear una cuenta. Puedes usar el espacio de trabajo sin ingresar posiciones reales. Toda función que requiera cuenta está señalada como tal antes de que hagas clic.",
      ],
      [
        "9. Cambios y contacto",
        (contact) => contact
          ? `Si esta política cambia de forma sustancial, actualizaremos la fecha de vigencia. También podremos enviar un aviso de servicio cuando la entrega de correo esté configurada. Para consultas de privacidad o solicitudes sobre tus datos, escribe a ${contact}.`
          : "Si esta política cambia de forma sustancial, actualizaremos la fecha de vigencia. También podremos enviar un aviso de servicio cuando la entrega de correo esté configurada. Este despliegue todavía no tiene una dirección de privacidad verificada; no envíes datos personales a una dirección que no aparezca aquí.",
      ],
    ],
  },
};

export default function PrivacyPage() {
  const config = getServerConfig();
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = COPY[locale];
  const contactCandidate = String(process.env.BLS_PRIME_PRIVACY_CONTACT || config.inviteContact || "").trim();
  const privacyContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactCandidate) && !/@example\.com$/i.test(contactCandidate)
    ? contactCandidate
    : "";

  return (
    <main className={`${styles.page} ${styles.legalPage}`}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href={`/?lang=${locale}`}>
          <span className={styles.brandName}>{config.appName}</span>
        </Link>
        <div className={styles.navActions}>
          <Link className={styles.btnGhost} href={`/terms?lang=${locale}`}>{copy.terms}</Link>
          <Link className={styles.btnGhost} href={`/?lang=${locale}`}>{copy.home}</Link>
        </div>
      </nav>

      <section className={styles.legalHero}>
        <p className={styles.tag}>{copy.tag}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro(config.appName)}</p>
        <span>{copy.effective}</span>
      </section>

      <section className={styles.legalBody}>
        {copy.sections.map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{typeof body === "function" ? body(privacyContact) : body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
