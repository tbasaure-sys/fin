"use client";

import { useEffect, useMemo, useState } from "react";
import { LANGUAGE_COOKIE_KEY, shouldPersistQueryLocale } from "@/lib/i18n/locale";

export const LANGUAGE_STORAGE_KEY = LANGUAGE_COOKIE_KEY;

const SUPPORTED_LANGUAGES = new Set(["en", "es"]);
const LANGUAGE_EVENT = "blsprime:language";

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : "en";
}

function readLanguageCookie() {
  if (typeof document === "undefined") return null;
  const prefix = LANGUAGE_STORAGE_KEY + "=";
  const entry = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

function writeLanguageCookie(language) {
  if (typeof document === "undefined") return;
  document.cookie = LANGUAGE_STORAGE_KEY + "=" + encodeURIComponent(language) + "; Path=/; Max-Age=31536000; SameSite=Lax";
}

export function readStoredLanguage() {
  if (typeof window === "undefined") return "en";
  try {
    const urlLanguage = new URLSearchParams(window.location.search).get("lang");
    if (SUPPORTED_LANGUAGES.has(urlLanguage) && shouldPersistQueryLocale({
      pathname: window.location.pathname,
      queryLanguage: urlLanguage,
    })) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, urlLanguage);
      writeLanguageCookie(urlLanguage);
      return urlLanguage;
    }
  } catch {}
  const cookieLanguage = readLanguageCookie();
  if (SUPPORTED_LANGUAGES.has(cookieLanguage)) return cookieLanguage;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.has(stored)) return stored;
  } catch {}
  return window.navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function writeStoredLanguage(language) {
  if (typeof window === "undefined") return;
  const nextLanguage = normalizeLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  } catch {}
  writeLanguageCookie(nextLanguage);
  document.documentElement.lang = nextLanguage;
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language: nextLanguage } }));
}

export function useLanguagePreference(initialLanguage = "en") {
  const [language, setLanguageState] = useState(() => normalizeLanguage(initialLanguage));

  useEffect(() => {
    setLanguageState(readStoredLanguage());

    function handleLanguage(event) {
      setLanguageState(normalizeLanguage(event?.detail?.language));
    }

    window.addEventListener(LANGUAGE_EVENT, handleLanguage);
    return () => window.removeEventListener(LANGUAGE_EVENT, handleLanguage);
  }, []);

  const setLanguage = useMemo(
    () => (nextLanguage) => {
      const normalized = normalizeLanguage(nextLanguage);
      setLanguageState(normalized);
      writeStoredLanguage(normalized);
    },
    [],
  );

  return { language, setLanguage };
}
