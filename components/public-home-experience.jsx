"use client";
import Link from "next/link";
import { useLanguagePreference } from "@/components/language-layer";
import styles from "@/app/landing-page.module.css";

export function PublicHomeExperience({ initialLanguage = "es" }) {
  const { language, setLanguage } = useLanguagePreference(initialLanguage);
  const en = language === "en";
  const research = `/research?lang=${language}`;
  const portfolios = `/app/carteras?lang=${language}`;
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
          <Link href={portfolios}>{en ? "Portfolios" : "Carteras"}</Link>
          <Link href={`/methodology?lang=${language}`}>{en ? "The method" : "El método"}</Link>
          <Link href={login}>{en ? "Sign in" : "Iniciar sesión"} </Link>
        </nav>
      </header>
      <main className={styles.main} id="main">
        <div className={styles.intro}>
          <p className={styles.signature}>BLS Prime</p>
          <h1>{en ? <>Value is not always<br />in plain sight.</> : <>El valor no siempre<br />está a la vista.</>}</h1>
          <p className={styles.description}>{en ? "Understand the cash, challenge your thesis, and connect it to your portfolio." : "Entiende la caja, cuestiona tu tesis y conéctala con tu cartera."}</p>
          <Link className={styles.enter} href={`/example?lang=${language}`}>
            {en ? "See a real example" : "Ver un ejemplo real"}
          </Link>
          <p className={styles.note}>{en ? "Microsoft · sources and calculations · no account" : "Microsoft · fuentes y cálculos · sin cuenta"}</p>
        </div>
      </main>
      <section className={styles.proof} aria-labelledby="proof-title">
        <p className={styles.note}>{en ? 'ONE COMPANY. A CONCRETE QUESTION.' : 'UNA EMPRESA. UNA PREGUNTA CONCRETA.'}</p>
        <h2 id="proof-title">{en ? 'More operating cash does not always mean more cash left over.' : 'Más caja operativa no siempre significa más caja disponible.'}</h2>
        <p>{en ? 'Walk through a historical Microsoft case: what changed, what remains unknown, and why position size matters. Then investigate a company of your own.' : 'Recorre un caso histórico de Microsoft: qué cambió, qué falta saber y por qué importa el tamaño de la posición. Después, investiga una empresa propia.'}</p>
        <Link href={`/example?lang=${language}`}>{en ? 'Read the case' : 'Leer el caso'} </Link>
        <p className={styles.note}>{en ? 'Your research stays private. An account is required to save theses and connect holdings.' : 'Tu investigación permanece privada. Para guardar tesis y conectar posiciones necesitas una cuenta.'}</p>
        <Link href={research}>{en ? 'Open my research space' : 'Abrir mi espacio de investigación'} </Link>
      </section>
      <footer className={styles.footer}>
        <nav aria-label={en ? "Explore" : "Explorar"}>
          <Link href={research}>{en ? "Companies" : "Empresas"}</Link><span aria-hidden="true">·</span>
          <Link href={`/aurora?lang=${language}`}>{en ? "Public valuation" : "Valoración pública"}</Link><span aria-hidden="true">·</span>
          <Link href={portfolios}>{en ? "Portfolios" : "Carteras"}</Link>
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
