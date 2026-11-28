import { useEffect, useState } from "react";
import { traducir } from "../../i18n/utils";

export default function InstallButton({ idioma = "es" }) {
  const [promptEvent, setPromptEvent] = useState(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true
    ) {
      setInstalada(true);
      return;
    }

    if (window.__pwaPrompt) {
      setPromptEvent(window.__pwaPrompt);
    }

    const alPoderInstalar = () => {
      setPromptEvent(window.__pwaPrompt);
    };

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

    promptEvent.prompt();

    const { outcome } = await promptEvent.userChoice;

    console.log("[PWA] Resultado de la instalación:", outcome);

    window.__pwaPrompt = null;
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
        justifyContent: "center",
        gap: "0.4rem",
        minHeight: "38px",
        padding: "0.45rem 0.75rem",
        borderRadius: "999px",
        border: "1.5px solid var(--color-gold)",
        background: "transparent",
        color: "#ffffff",
        fontSize: "0.8rem",
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true">⬇</span>

      {traducir(idioma, "Instalar app", "Install app")}
    </button>
  );
}
