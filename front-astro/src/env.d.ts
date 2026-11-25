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

declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    immediate?: boolean;
  }): (reloadPage?: boolean) => Promise<void>;
}
