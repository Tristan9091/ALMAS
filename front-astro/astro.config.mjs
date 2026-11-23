import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { AstroPWAIntegration } from "@vite-pwa/astro";

export default defineConfig({
  integrations: [
    react(),
    AstroPWAIntegration({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico"],
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
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: { navigateFallback: null },
      devOptions: { enabled: true },
    }),
  ],
  adapter: netlify({ devFeatures: { edgeFunctions: false } }),
  output: "server",
});