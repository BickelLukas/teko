import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enPages from "./locales/en/pages.json";
import deCommon from "./locales/de/common.json";
import dePages from "./locales/de/pages.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, pages: enPages },
      de: { common: deCommon, pages: dePages },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "pages"],
    interpolation: { escapeValue: false },
    detection: {
      // Detect from browser only; user preference from /api/me takes over once loaded
      order: ["navigator"],
      caches: [],
    },
  });

export default i18n;
