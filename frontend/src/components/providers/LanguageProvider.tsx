"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { AppLanguage, DEFAULT_LANGUAGE, getLanguage, setLanguage, t } from "@/lib/language";

type LanguageContextType = {
  language: AppLanguage;
  draftLanguage: AppLanguage;
  setDraftLanguage: (lang: AppLanguage) => void;
  applyLanguage: () => void;
  changeLanguage: (lang: AppLanguage) => void;
  tr: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<AppLanguage>(() => {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    return getLanguage();
  });
  const [draftLanguage, setDraftLanguage] = useState<AppLanguage>(language);

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      draftLanguage,
      setDraftLanguage,
      applyLanguage: () => {
        setLanguage(draftLanguage);
        setLang(draftLanguage);
      },
      changeLanguage: (lang: AppLanguage) => {
        setLanguage(lang);
        setDraftLanguage(lang);
        setLang(lang);
      },
      tr: (key: string) => t(language, key),
    }),
    [language, draftLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
