/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "virtual:pwa-info" {
  export const pwaInfo:
    | {
        webManifest: {
          href: string;
          linkTag: string;
        };
      }
    | undefined;
}
