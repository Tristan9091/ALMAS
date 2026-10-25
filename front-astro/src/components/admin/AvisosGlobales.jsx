import { useAdmin } from "./useAdmin";
import { useEventosBackoffice } from "./useEventosBackoffice";
import { EVENTO_VIVO } from "./useRefrescarEnVivo";
import AvisosEnVivo from "./AvisosEnVivo";

/**
 * Vive en AdminLayout, así que está en todas las pantallas del panel.
 * Abre la suscripción, muestra los avisos flotantes y reenvía cada evento
 * a la pantalla actual como un evento del navegador.
 */
export default function AvisosGlobales() {
  const acceso = useAdmin();

  const { avisos, descartar, conexionPerdida } = useEventosBackoffice({
    activo: acceso.estado === "listo",
    onEvento: (evento) => {
      window.dispatchEvent(new CustomEvent(EVENTO_VIVO, { detail: evento }));
    },
  });

  return (
    <AvisosEnVivo
      avisos={avisos}
      descartar={descartar}
      conexionPerdida={conexionPerdida}
    />
  );
}