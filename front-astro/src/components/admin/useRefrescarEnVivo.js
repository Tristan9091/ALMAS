import { useEffect, useRef } from "react";

// Nombre del evento del navegador con el que el layout avisa a las pantallas.
export const EVENTO_VIVO = "almas:evento";

/**
 * Hace que una pantalla vuelva a cargar sus datos cuando llega un evento.
 *
 * - recargar: la función cargar() de la pantalla.
 * - prefijos: tipos que le interesan, por ejemplo ["pedido_", "pago_"].
 *             Si no pasas nada, recarga con cualquier evento.
 */
export function useRefrescarEnVivo(recargar, prefijos = []) {
  // Siempre se llama la versión más reciente de recargar.
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  const clave = prefijos.join(",");

  useEffect(() => {
    const lista = clave ? clave.split(",") : [];

    const alRecibir = (e) => {
      const tipo = e.detail?.tipo ?? "";
      if (lista.length === 0 || lista.some((p) => tipo.startsWith(p))) {
        recargarRef.current();
      }
    };

    window.addEventListener(EVENTO_VIVO, alRecibir);
    return () => window.removeEventListener(EVENTO_VIVO, alRecibir);
  }, [clave]);
}