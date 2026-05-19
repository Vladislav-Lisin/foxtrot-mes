// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: ["@nuxt/eslint", "@nuxt/ui", "@pinia/nuxt", "@nuxt/image"],
  devtools: {
    enabled: true,
  },

  app: {
    head: {
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Sofia+Sans+Condensed:wght@300;400;500;600;700&display=swap"
        }
      ]
    }
  },
  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    public: {
      apiBase: "https://foxtrot-backend-4s11.onrender.com",
    },
  },

  routeRules: {
    "/": { prerender: true },
  },

  compatibilityDate: "2025-01-15",

  nitro: {
    preset: "node-server",
  },
  eslint: {
    config: {
      stylistic: {
        commaDangle: "never",
        braceStyle: "1tbs",
      },
    },
  },
});
