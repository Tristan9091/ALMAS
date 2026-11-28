import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { AstroPWAIntegration } from "@vite-pwa/astro";

export default defineConfig({
  site: "https://almasjeweler.netlify.app",

  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    react(),
    AstroPWAIntegration({
      registerType: "autoUpdate",

      manifest: {
        name: "ALMĀS Joyería",
        short_name: "ALMĀS",
        description: "ALMĀS - Joyería",
        lang: "es",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#8f1268",
        background_color: "#ffffff",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      generateSW: {
        navigateFallback: null,

        // Actualización y activación del Service Worker
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        // Precache de recursos estáticos
        globPatterns: [
          "**/*.{html,css,js,mjs,png,jpg,jpeg,webp,svg,ico,woff,woff2,webmanifest}",
        ],

        runtimeCaching: [
          // Network-first: catálogo, categorías y productos
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin &&
              request.mode === "navigate" &&
              (url.pathname === "/" ||
                /^\/en\/?$/.test(url.pathname) ||
                /^(\/en)?\/categoria\/\d+\/?$/.test(url.pathname) ||
                /^(\/en)?\/producto\/\d+\/?$/.test(url.pathname)),

            handler: "NetworkFirst",
            method: "GET",

            options: {
              cacheName: "almas-catalogo-v1",
              networkTimeoutSeconds: 5,

              cacheableResponse: {
                statuses: [200],
              },

              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },

              precacheFallback: {
                fallbackURL: "/offline",
              },
            },
          },

          // Cache-first: CSS, JS, fuentes e imágenes locales
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              ["style", "script", "font", "image"].includes(
                request.destination,
              ),

            handler: "CacheFirst",
            method: "GET",

            options: {
              cacheName: "almas-assets-v1",

              cacheableResponse: {
                statuses: [200],
              },

              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },

          // Cache-first: imágenes de productos en Cloudinary
          {
            urlPattern: ({ url, request }) =>
              url.hostname === "res.cloudinary.com" &&
              request.destination === "image",

            handler: "CacheFirst",
            method: "GET",

            options: {
              cacheName: "almas-imagenes-v1",

              cacheableResponse: {
                statuses: [0, 200],
              },

              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },

          // Network-only: demás páginas
          // No almacenar checkout, pedidos ni administración
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.mode === "navigate",

            handler: "NetworkOnly",
            method: "GET",

            options: {
              precacheFallback: {
                fallbackURL: "/offline",
              },
            },
          },
        ],
      },

      devOptions: {
        enabled: true,
      },
    }),
  ],

  adapter: netlify({
    devFeatures: {
      edgeFunctions: false,
    },
  }),

  output: "server",
});
