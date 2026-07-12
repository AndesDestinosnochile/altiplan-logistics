import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import pt from "./locales/pt-BR.json";
import es from "./locales/es-CL.json";

const STORAGE_KEY = "i18nextLng";

function detectInitialLng(): string {
  if (typeof window === "undefined") return "pt-BR";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "pt-BR" || saved === "es-CL") return saved;
    const nav = window.navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("es")) return "es-CL";
  } catch {
    /* ignore */
  }
  return "pt-BR";
}

if (!i18n.isInitialized) {
  // Synchronous init so useTranslation returns real strings on first render.
  i18n.use(initReactI18next).init({
    resources: { "pt-BR": { translation: pt }, "es-CL": { translation: es } },
    lng: detectInitialLng(),
    fallbackLng: "pt-BR",
    supportedLngs: ["pt-BR", "es-CL"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initImmediate: false,
  });

  if (typeof window !== "undefined") {
    i18n.on("languageChanged", (lng) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, lng);
      } catch {
        /* ignore */
      }
    });
  }
}

export default i18n;
