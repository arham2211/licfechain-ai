"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppLanguage, DEFAULT_LANGUAGE, getLanguage, setLanguage, t } from "@/lib/language";
import { translateDynamicTexts } from "@/lib/dynamic-translation";
import { STORAGE_KEYS } from "@/lib/config";

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
  const textOriginalsRef = useRef(new WeakMap<Text, string>());
  const attrOriginalsRef = useRef(new WeakMap<HTMLElement, Record<string, string>>());
  const [language, setLang] = useState<AppLanguage>(() => {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    return getLanguage();
  });
  const [draftLanguage, setDraftLanguage] = useState<AppLanguage>(language);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";

    const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "OPTION"]);
    const textOriginals = textOriginalsRef.current;
    const attrOriginals = attrOriginalsRef.current;

    const isEnglishLike = (value: string) => /[A-Za-z]/.test(value);

    const collectTextNodes = (root: Node) => {
      const nodes: Array<{ node: Text; source: string }> = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (candidate) => {
          const text = candidate.textContent?.trim() ?? "";
          const parent = candidate.parentElement;
          if (!text || !parent) return NodeFilter.FILTER_REJECT;
          if (skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[data-no-translate='true']")) return NodeFilter.FILTER_REJECT;
          if (!isEnglishLike(text) && !textOriginals.has(candidate as Text)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let current = walker.nextNode();
      while (current) {
        const textNode = current as Text;
        const source = textOriginals.get(textNode) ?? textNode.textContent ?? "";
        if (!textOriginals.has(textNode) && isEnglishLike(source.trim())) {
          textOriginals.set(textNode, source);
        }
        if ((textOriginals.get(textNode) ?? "").trim()) {
          nodes.push({ node: textNode, source: textOriginals.get(textNode) ?? source });
        }
        current = walker.nextNode();
      }
      return nodes;
    };

    const collectAttrNodes = (root: ParentNode) => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>("[placeholder], [title]"));
      const attrs: Array<{ element: HTMLElement; attr: "placeholder" | "title"; source: string }> = [];

      for (const element of elements) {
        if (element.closest("[data-no-translate='true']")) continue;
        const originalBucket = attrOriginals.get(element) ?? {};
        for (const attr of ["placeholder", "title"] as const) {
          const currentValue = element.getAttribute(attr)?.trim();
          if (!currentValue) continue;
          if (!originalBucket[attr] && isEnglishLike(currentValue)) {
            originalBucket[attr] = currentValue;
          }
          const source = originalBucket[attr];
          if (source) {
            attrs.push({ element, attr, source });
          }
        }
        if (Object.keys(originalBucket).length > 0) {
          attrOriginals.set(element, originalBucket);
        }
      }

      return attrs;
    };

    let cancelled = false;

    const translateRoot = async (rootNode: ParentNode) => {
      const textNodes = collectTextNodes(rootNode);
      const attrNodes = collectAttrNodes(rootNode);
      const texts = Array.from(new Set([
        ...textNodes.map(({ source }) => source.trim()),
        ...attrNodes.map(({ source }) => source.trim()),
      ].filter(Boolean)));

      if (texts.length === 0) return;

      const translations = await translateDynamicTexts(texts, language);
      if (cancelled) return;

      for (const { node, source } of textNodes) {
        const translated = language === "en" ? source : (translations[source.trim()] ?? source);
        if (node.textContent !== translated) {
          node.textContent = translated;
        }
      }

      for (const { element, attr, source } of attrNodes) {
        const translated = language === "en" ? source : (translations[source.trim()] ?? source);
        if (element.getAttribute(attr) !== translated) {
          element.setAttribute(attr, translated);
        }
      }
    };

    translateRoot(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of Array.from(mutation.addedNodes)) {
          if (addedNode.nodeType === Node.TEXT_NODE) {
            const parent = addedNode.parentElement;
            if (parent) translateRoot(parent);
          } else if (addedNode.nodeType === Node.ELEMENT_NODE) {
            translateRoot(addedNode as ParentNode);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.language && event.newValue) {
        const next = event.newValue as AppLanguage;
        setDraftLanguage(next);
        setLang(next);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, [language]);

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
