import { useEffect, useState } from "react";

/**
 * Botón propio para instalar la PWA (bono P3-2).
 * El evento beforeinstallprompt se captura en Layout.astro y se guarda en
 * window.__pwaPrompt; aquí solo se lee, así no se pierde si el componente
 * se vuelve a montar.
 */
export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    // Ya se está ejecutando como app instalada
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalada(true);
      return;
    }

    // Si el evento ya había llegado antes de montar el componente
    if (window.__pwaPrompt) setPromptEvent(window.__pwaPrompt);

    const alPoderInstalar = () => setPromptEvent(window.__pwaPrompt);
    const alInstalar = () => {
      setInstalada(true);
      setPromptEvent(null);
    };

    window.addEventListener("pwa-prompt-ready", alPoderInstalar);
    window.addEventListener("pwa-installed", alInstalar);

    return () => {
      window.removeEventListener("pwa-prompt-ready", alPoderInstalar);
      window.removeEventListener("pwa-installed", alInstalar);
    };
  }, []);

  async function instalar() {
    if (!promptEvent) return;

    promptEvent.prompt(); // muestra el diálogo nativo de instalación
    const { outcome } = await promptEvent.userChoice; // "accepted" | "dismissed"
    console.log("[PWA] Resultado de la instalación:", outcome);

    window.__pwaPrompt = null; // el evento solo se puede usar una vez
    setPromptEvent(null);
  }

  if (instalada || !promptEvent) return null;

  return (
    <button
      type="button"
      onClick={instalar}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.5rem 1rem",
        borderRadius: "999px",
        border: "1.5px solid var(--color-gold)",
        background: "transparent",
        color: "var(--color-gold)",
        fontSize: "0.95rem",
        cursor: "pointer",
      }}
    >
      ⬇ Instalar app
    </button>
  );
}