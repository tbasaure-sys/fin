"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLanguagePreference } from "@/components/language-preference";
import { buildPublicNavigation, buildToolLinks } from "@/lib/public-shell-navigation";
import { isSpanishOnlyRoute } from "@/lib/i18n/locale";
import styles from "./site-footer.module.css";

const PRIVATE_PREFIXES = ["/app", "/mosaic", "/legacy"];

const COPY = {
  es: {
    tagline: "Software de investigación de inversiones. Organiza evidencia, supuestos y escenarios; no recomienda compras ni ejecuta órdenes.",
    product: "Producto",
    tools: "Herramientas",
    company: "Legal",
    privacy: "Privacidad",
    terms: "Términos",
    rights: "No es asesoría financiera.",
  },
  en: {
    tagline: "Investment research software. It organizes evidence, assumptions and scenarios; it does not recommend trades or execute orders.",
    product: "Product",
    tools: "Tools",
    company: "Legal",
    privacy: "Privacy",
    terms: "Terms",
    rights: "Not financial advice.",
  },
};

export function SiteFooter({ initialLanguage = "es" }) {
  const pathname = usePathname() || "/";
  const { language: preferred } = useLanguagePreference(initialLanguage);
  if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  const spanishOnly = isSpanishOnlyRoute(pathname);
  const language = spanishOnly ? "es" : preferred === "en" ? "en" : "es";
  const copy = COPY[language];
  const navigation = buildPublicNavigation({ locale: language, pathname });
  const tools = buildToolLinks(language);

  return (
    <footer className={styles.footer} data-no-translate>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link className={styles.brand} href={`/?lang=${language}`}>
            BLS <span>/ PRIME</span>
          </Link>
          <p>{copy.tagline}</p>
        </div>

        <nav aria-label={copy.product} className={styles.column}>
          <h2>{copy.product}</h2>
          {navigation.map((item) => (
            <Link href={item.href} key={item.id}>{item.label}</Link>
          ))}
        </nav>

        <nav aria-label={copy.tools} className={styles.column}>
          <h2>{copy.tools}</h2>
          {tools.map((item) => (
            <Link href={item.href} key={item.id}>{item.label}</Link>
          ))}
        </nav>

        <nav aria-label={copy.company} className={styles.column}>
          <h2>{copy.company}</h2>
          <Link href={`/privacy?lang=${language}`}>{copy.privacy}</Link>
          <Link href={`/terms?lang=${language}`}>{copy.terms}</Link>
        </nav>
      </div>

      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} BLS Prime · {copy.rights}</span>
      </div>
    </footer>
  );
}
