// Mapa de cada tipo de evento a su color e ícono.
// Los íconos van junto al texto para no depender solo del color.
const ESTILOS = {
  pedido_creado: { clase: "badge-info", icono: "+" },
  pedido_cancelado: { clase: "badge-neutro", icono: "✕" },
  pago_aprobado: { clase: "badge-bien", icono: "✓" },
  pago_rechazado: { clase: "badge-critico", icono: "✕" },
  pago_reembolsado: { clase: "badge-aviso", icono: "↺" },
  pago_incidencia: { clase: "badge-critico", icono: "!" },
  pago_por_verificar: { clase: "badge-aviso", icono: "?" },
  pago_actualizado: { clase: "badge-neutro", icono: "•" },
  stock_bajo: { clase: "badge-aviso", icono: "!" },
  cliente_nuevo: { clase: "badge-info", icono: "+" },
};

const POR_DEFECTO = { clase: "badge-neutro", icono: "•" };

/**
 * Notificaciones flotantes del panel.
 * Recibe lo que regresa useEventosBackoffice().
 */
export default function AvisosEnVivo({ avisos, descartar, conexionPerdida }) {
  return (
    <div className="avisos-en-vivo" aria-live="polite">
      {conexionPerdida && (
        <div className="aviso-vivo aviso-vivo-sin-conexion" role="status">
          Sin conexión en vivo. Reconectando…
        </div>
      )}

      {avisos.map((aviso) => {
        const estilo = ESTILOS[aviso.tipo] ?? POR_DEFECTO;
        return (
          <div key={aviso.id} className="aviso-vivo" role="status">
            <span className={`badge ${estilo.clase}`}>
              <span aria-hidden="true">{estilo.icono}</span>
            </span>
            <p>{aviso.mensaje}</p>
            <button
              type="button"
              className="aviso-vivo-cerrar"
              onClick={() => descartar(aviso.id)}
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}