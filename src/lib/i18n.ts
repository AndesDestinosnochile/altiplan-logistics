console.log("i18n carregou");

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: pt },
    "es-CL": { translation: es },
  },
  lng: detectInitialLng(),
  fallbackLng: "pt-BR",
  supportedLngs: ["pt-BR", "es-CL"],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

console.log("i18n inicializado");
