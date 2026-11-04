"use client";

import { setUiLanguage } from "@/lab/i18n.js";
import type { UiLanguage } from "./useUiLanguage";

const LANGUAGES: UiLanguage[] = ["fr", "en"];

/** FR | EN, remembered; switching reloads the page in the other language. */
export function LanguageSwitch({ current }: { current: UiLanguage }) {
  return (
    <div className="seg lang" role="group" aria-label={current === "fr" ? "Langue" : "Language"}>
      {LANGUAGES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === current} onClick={() => l !== current && setUiLanguage(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
