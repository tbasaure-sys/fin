"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { useLanguagePreference } from "@/components/language-preference";

// Persists the choice and reloads the current route in that language, so
// server-rendered copy changes too (not only client components).
export function useLanguageSwitch(initialLanguage = "es") {
  const { language, setLanguage } = useLanguagePreference(initialLanguage);
  const router = useRouter();
  const pathname = usePathname() || "/";

  const switchLanguage = useCallback(
    (next) => {
      setLanguage(next);
      const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
      params.set("lang", next);
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      router.replace(`${pathname}?${params.toString()}${hash}`, { scroll: false });
      if (next !== language) router.refresh();
    },
    [language, pathname, router, setLanguage],
  );

  return { language, switchLanguage };
}
