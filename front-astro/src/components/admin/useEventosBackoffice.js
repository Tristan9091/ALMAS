import { useCallback, useEffect, useRef, useState } from "react";
import { graphqlSubscribe } from "../../graphql/client";

const SUBSCRIPCION = `
  subscription {
    eventosBackoffice { tipo mensaje pedidoId fecha }
  }
`;

const MAX_AVISOS = 5; // cuántos avisos se muestran a la vez
const DURACION_MS = 6000; // cuánto tarda en desaparecer cada aviso

let contador = 0; // id local para cada aviso (solo para las keys de React)

/**
 * Escucha los eventos en vivo del backoffice.
 *
 * - activo:   true cuando ya se confirmó que el usuario es admin
 *             (acceso.estado === "listo").
 * - onEvento: función que recibe cada evento { tipo, mensaje, pedidoId, fecha }.
 *             Aquí cada pantalla decide qué recargar.
 *
 * Regresa { avisos, descartar, conexionPerdida }.
 */
export function useEventosBackoffice({ activo, onEvento }) {
  const [avisos, setAvisos] = useState([]);
  const [conexionPerdida, setConexionPerdida] = useState(false);

  // Guardamos la última versión de onEvento sin reabrir el WebSocket
  // cada vez que el componente se vuelve a renderizar.
  const onEventoRef = useRef(onEvento);
  useEffect(() => {
    onEventoRef.current = onEvento;
  }, [onEvento]);

  const descartar = useCallback((id) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id));
  }, []);

    useEffect(() => {
    console.log("[avisos] activo =", activo);
    if (!activo) return;

    const cerrar = graphqlSubscribe(
      SUBSCRIPCION,
      (data) => {
        console.log("[avisos] evento recibido:", data);
        const evento = data.eventosBackoffice;
        const aviso = { ...evento, id: ++contador };

        setConexionPerdida(false);
        setAvisos((actuales) => [aviso, ...actuales].slice(0, MAX_AVISOS));
        setTimeout(() => descartar(aviso.id), DURACION_MS);

        onEventoRef.current?.(evento);
      },
            (mensaje) => {
        console.error("[avisos] error:", mensaje);
        setConexionPerdida(true);
      },
    );

    // Al salir de la página se cierra el WebSocket.
    return cerrar;
  }, [activo, descartar]);

  return { avisos, descartar, conexionPerdida };
}