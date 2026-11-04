"use client";

import { useEffect, useState } from "react";
import { uiLanguage } from "@/lab/i18n.js";

export type UiLanguage = "fr" | "en";

/** The interface's language: ?lang=, then the visitor's last choice, then the browser's.
 *  Null until the page runs in the browser (the static page cannot know it). */
export function useUiLanguage(): UiLanguage | null {
  const [lang, setLang] = useState<UiLanguage | null>(null);
  useEffect(() => {
    const chosen = uiLanguage() as UiLanguage;
    document.documentElement.lang = chosen;
    setLang(chosen);
  }, []);
  return lang;
}
