"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { useLanguageSwitch } from "./use-language-switch";
import { buildPublicNavigation, buildPublicShellActions } from "@/lib/public-shell-navigation";
import styles from "./public-site-header.module.css";

const UI_COPY = {
  es: {
    brandAria: "BLS Prime, inicio",
    language: "Elegir idioma",
    menu: "Abrir navegación",
    closeMenu: "Cerrar navegación",
    nav: "Navegación principal",
    account: "Tu cuenta",
  },
  en: {
    brandAria: "BLS Prime, home",
    language: "Choose language",
    menu: "Open navigation",
    closeMenu: "Close navigation",
    nav: "Primary navigation",
    account: "Your account",
  },
};

export function PublicSiteHeader({
  authenticated = false,
  availableLanguages = ["es", "en"],
  initialLanguage = "es",
  variant = "solid",
}) {
  const pathname = usePathname() || "/";
  const { language: preferredLanguage, switchLanguage: setLanguage } = useLanguageSwitch(initialLanguage);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const languages = availableLanguages.filter((item) => item === "es" || item === "en");
  const language = languages.includes(preferredLanguage) ? preferredLanguage : languages[0] || "es";
  const copy = UI_COPY[language] || UI_COPY.es;
  const navigation = useMemo(
    () => buildPublicNavigation({ locale: language, pathname }),
    [language, pathname],
  );
  const actions = useMemo(() => buildPublicShellActions(language), [language]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={`${styles.shell} public-site-header`} data-no-translate data-variant={variant} data-open={menuOpen}>
      <div className={styles.inner}>
        <Link className={styles.brand} href={`/?lang=${language}`} aria-label={copy.brandAria}>
          BLS <span>/ PRIME</span>
        </Link>

        <button
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? copy.closeMenu : copy.menu}
          className={styles.menuButton}
          data-open={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          <span />
          <span />
        </button>

        <div className={styles.navigation} data-open={menuOpen} id={menuId}>
          <nav aria-label={copy.nav} className={styles.navLinks}>
            {navigation.map((item) => (
              <Link
                aria-current={item.current ? "page" : undefined}
                data-current={item.current}
                href={item.href}
                key={item.id}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            {languages.length > 1 ? (
              <div aria-label={copy.language} className={styles.language} role="group">
                {languages.map((item) => (
                  <button
                    aria-pressed={language === item}
                    data-active={language === item}
                    key={item}
                    onClick={() => setLanguage(item)}
                    type="button"
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : null}
            {authenticated ? (
              <Link className={styles.signUp} href={`/app?lang=${language}`}>
                {copy.account}
              </Link>
            ) : (
              <>
                <Link className={styles.signIn} href={actions.signIn.href}>
                  {actions.signIn.label}
                </Link>
                <Link className={styles.signUp} href={actions.signUp.href}>
                  {actions.signUp.label}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
