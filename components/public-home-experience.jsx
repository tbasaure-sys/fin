"use client";
import Link from "next/link";
import { useLanguagePreference } from "@/components/language-layer";
import styles from "@/app/landing-page.module.css";

export function PublicHomeExperience({ initialLanguage = "es" }) {
  const { language, setLanguage } = useLanguagePreference(initialLanguage);
  const en = language === "en";
  const research = `/research?lang=${language}`;
  const login = `/login?intent=signin&lang=${language}&next=${encodeURIComponent(research)}`;
  return (
    <div className={styles.page} data-no-translate>
      <div className={styles.scene} aria-hidden="true" />
      <a className={styles.skip} href="#main">{en ? "Skip to content" : "Ir al contenido"}</a>
      <header className={styles.header}>
        <Link className={styles.wordmark} href={`/?lang=${language}`} aria-label="BLS Prime">
          BLS <span>/ PRIME</span>
        </Link>
        <nav aria-label={en ? "Main navigation" : "Navegación principal"}>
          <Link href={`/methodology?lang=${language}`}>{en ? "The method" : "El método"}</Link>
          <Link href={login}>{en ? "Sign in" : "Iniciar sesión"} <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      <main className={styles.main} id="main">
        <div className={styles.intro}>
          <p className={styles.signature}>BLS Prime</p>
          <h1>{en ? <>Value is not always<br />in plain sight.</> : <>El valor no siempre<br />está a la vista.</>}</h1>
          <p className={styles.description}>{en ? "Study the business. Question the price." : "Investiga el negocio. Cuestiona el precio."}</p>
          <Link className={styles.enter} href={research}>
            {en ? "Enter BLS Prime" : "Entrar a BLS Prime"} <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.note}>{en ? "One account. A space to investigate." : "Una cuenta. Un espacio para investigar."}</p>
        </div>
      </main>
      <footer className={styles.footer}>
        <nav aria-label={en ? "Explore" : "Explorar"}>
          <Link href={research}>{en ? "Companies" : "Empresas"}</Link><span aria-hidden="true">·</span>
          <Link href={`/aurora?lang=${language}`}>{en ? "Valuation" : "Valoración"}</Link><span aria-hidden="true">·</span>
          <Link href={`/app?lang=${language}`}>{en ? "Portfolio" : "Cartera"}</Link>
        </nav>
        <nav aria-label={en ? "Legal and language" : "Información legal e idioma"}>
          <Link href={`/privacy?lang=${language}`}>{en ? "Privacy" : "Privacidad"}</Link>
          <Link href={`/terms?lang=${language}`}>{en ? "Terms" : "Términos"}</Link>
          <span className={styles.languages}><Link href="/?lang=es" onClick={() => setLanguage("es")} hrefLang="es" aria-current={!en ? "page" : undefined}>ES</Link><span aria-hidden="true">/</span><Link href="/?lang=en" onClick={() => setLanguage("en")} hrefLang="en" aria-current={en ? "page" : undefined}>EN</Link></span>
        </nav>
      </footer>
    </div>
  );
}
