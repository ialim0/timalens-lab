"use client";

// The address of the app opens a lab straight away (the bulbs, in 3D), in the visitor's language.
import { useEffect } from "react";
import { uiLanguage } from "@/lab/i18n.js";

export const DEFAULT_LAB = "sample-lampes";

export default function StartLab() {
  useEffect(() => {
    const lang = uiLanguage();
    const asked = new URLSearchParams(location.search).get("lang");
    location.replace(`/lab?lab=${DEFAULT_LAB}-${lang}${asked ? `&lang=${asked}` : ""}`);
  }, []);
  return null;
}
