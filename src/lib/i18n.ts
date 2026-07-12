import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import pt from "./locales/pt-BR.json";
import es from "./locales/es-CL.json";

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { "pt-BR": { translation: pt }, "es-CL": { translation: es } },
      lng: "pt-BR",
      fallbackLng: "pt-BR",
      supportedLngs: ["pt-BR", "es-CL"],
      interpolation: { escapeValue: false },
      detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
      react: { useSuspense: false },
    });
}

export default i18n;
