import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";

const MIS_PEDIDOS = `
  query MisPedidos {
    misPedidos {
      id
      fecha
      estatus
      estadoPago
      total
      direccionEnvio
      detalles {
        productoId
        nombreProducto
        variante
        cantidad
        precioUnitario
      }
    }
  }
`;

const CANCELAR_MI_PEDIDO = `
  mutation CancelarMiPedido($pedidoId: Int!) {
    cancelarMiPedido(pedidoId: $pedidoId)
  }
`;

const ETIQUETAS_PEDIDO = {
  pendiente: "Pendiente de pago",
  pagado: "Pagado",
  en_preparacion: "En preparación",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
  incidencia_stock: "Revisión de inventario",
  incidencia_monto: "Revisión del importe",
  incidencia_duplicado: "Revisión de cobro duplicado",
  incidencia_cancelado: "Revisión de cobro",
  incidencia_tardia: "Revisión de cobro",
  incidencia_sin_intento: "Revisión de cobro",
};

const ETIQUETAS_PAGO = {
  approved: "Aprobado",
  authorized: "Autorizado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Contracargo",
  creado: "Sin completar",
  enviando: "Procesando",
  verificacion: "En verificación",
};
// Mismo criterio que usa Checkout: solo se puede retomar el pago si
// no hay un cobro abierto. Si hay duda, el backend lo bloquea de todos modos.
const PAGOS_REANUDABLES = [null, "rejected", "cancelled"];

function puedeContinuarPago(pedido) {
  return (
    pedido.estatus === "pendiente" &&
    PAGOS_REANUDABLES.includes(pedido.estadoPago ?? null)
  );
}

function esPagoPendiente(pedido) {
  return pedido.estatus === "pendiente";
}

function tono(estado) {
  if (["pagado", "entregado", "approved"].includes(estado)) return "ok";
  if (
    [
      "cancelado",
      "reembolsado",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
    ].includes(estado)
  )
    return "error";
  if (estado?.startsWith("incidencia_") || estado === "verificacion")
    return "error";
  return "pending";
}

function moneda(valor) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(valor) || 0);
}

function fechaLegible(valor) {
  if (!valor) return "Fecha no disponible";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(fecha);
}

function Estado({ estado, tipo }) {
  const etiquetas = tipo === "pago" ? ETIQUETAS_PAGO : ETIQUETAS_PEDIDO;
  return (
    <span
      className={`mis-pedidos__estado mis-pedidos__estado--${tono(estado)}`}
    >
      {estado
        ? etiquetas[estado] || estado.replaceAll("_", " ")
        : "Sin pago registrado"}
    </span>
  );
}

export default function MisPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertos, setAbiertos] = useState({});
  const [seccion, setSeccion] = useState("compras");
  const [cancelando, setCancelando] = useState(null);
  const [errorCancelacion, setErrorCancelacion] = useState("");

  async function cargar() {
    if (!localStorage.getItem("almas-token")) {
      window.location.replace("/login");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const datos = await graphqlAuthRequest(MIS_PEDIDOS);
      setPedidos(datos?.misPedidos || []);
    } catch (err) {
      setError(err?.message || "No se pudo cargar el historial de pedidos.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const compras = pedidos.filter((pedido) => !esPagoPendiente(pedido));

  const pagosPendientes = pedidos.filter(esPagoPendiente);

  const pedidosVisibles = seccion === "compras" ? compras : pagosPendientes;

  async function cancelarPedido(pedido) {
    if (cancelando !== null) return;

    const confirmar = window.confirm(
      `¿Quieres cancelar el pedido #${pedido.id}?\n\n` +
        "Esta accion no se puede deshacer. " +
        "Si quieres comprar estos productos despues, " +
        "tendras que hacer un nuevo pedido.",
    );

    if (!confirmar) return;

    setCancelando(pedido.id);
    setErrorCancelacion("");

    try {
      const resultado = await graphqlAuthRequest(CANCELAR_MI_PEDIDO, {
        pedidoId: pedido.id,
      });

      if (resultado?.cancelarMiPedido !== true) {
        throw new Error("No se pudo confirmar la cancelacion.");
      }

      await cargar();
    } catch (err) {
      setErrorCancelacion(err?.message || "No se pudo cancelar el pedido.");
    } finally {
      setCancelando(null);
    }
  }

  return (
    <section className="mis-pedidos" aria-label="Historial de pedidos">
      <div className="mis-pedidos__encabezado">
        <div>
          <p className="mis-pedidos__eyebrow">TU CUENTA</p>
          <h1>Mis pedidos</h1>
          <p className="mis-pedidos__subtitulo">
            Consulta tus compras y el estado de cada pedido.
          </p>
        </div>
        <button
          className="mis-pedidos__actualizar"
          type="button"
          onClick={cargar}
          disabled={cargando}
        >
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div
        className="mis-pedidos__pestanas"
        role="group"
        aria-label="Secciones de pedidos"
      >
        <button
          type="button"
          className={seccion === "compras" ? "activa" : ""}
          aria-pressed={seccion === "compras"}
          onClick={() => setSeccion("compras")}
        >
          Mis compras ({compras.length})
        </button>

        <button
          type="button"
          className={seccion === "pendientes" ? "activa" : ""}
          aria-pressed={seccion === "pendientes"}
          onClick={() => setSeccion("pendientes")}
        >
          Pagos pendientes ({pagosPendientes.length})
        </button>
      </div>

      {errorCancelacion && (
        <p className="mis-pedidos__error-cancelacion" role="alert">
          {errorCancelacion}
        </p>
      )}

      {cargando ? (
        <p className="mis-pedidos__mensaje" role="status">
          Cargando tus pedidos…
        </p>
      ) : null}

      {!cargando && error ? (
        <div className="mis-pedidos__vacio" role="alert">
          <h2>No pudimos consultar tus pedidos</h2>
          <p>{error}</p>
          <button type="button" onClick={cargar}>
            Intentar de nuevo
          </button>
          <p>
            Si tu sesión venció, <a href="/login">vuelve a iniciar sesión</a>.
          </p>
        </div>
      ) : null}

      {!cargando && !error && pedidosVisibles.length === 0 ? (
        <div className="mis-pedidos__vacio">
          <h2>
            {seccion === "compras"
              ? "Aún no tienes compras"
              : "No tienes pagos pendientes"}
          </h2>
          <p>
            {seccion === "compras"
              ? "Cuando completes una compra, podrás consultar aquí su información."
              : "Los pedidos pendientes o rechazados aparecerán aquí."}
          </p>

          <a className="mis-pedidos__comprar" href="/">
            Explorar catálogo
          </a>
        </div>
      ) : null}

      {!cargando && !error && pedidosVisibles.length > 0 ? (
        <div className="mis-pedidos__lista">
          {pedidosVisibles.map((pedido) => {
            const abierto = !!abiertos[pedido.id];
            return (
              <article className="mis-pedidos__tarjeta" key={pedido.id}>
                <div className="mis-pedidos__fila">
                  <div>
                    <p className="mis-pedidos__numero">Pedido #{pedido.id}</p>
                    <p className="mis-pedidos__fecha">
                      {fechaLegible(pedido.fecha)}
                    </p>
                  </div>
                  <div className="mis-pedidos__importe">
                    {moneda(pedido.total)}
                  </div>
                </div>
                <div className="mis-pedidos__estados">
                  <div>
                    <span>Pedido</span>
                    <Estado estado={pedido.estatus} tipo="pedido" />
                  </div>
                  <div>
                    <span>Pago</span>
                    <Estado estado={pedido.estadoPago} tipo="pago" />
                  </div>
                </div>
                {puedeContinuarPago(pedido) && (
                  <div className="mis-pedidos__accion">
                    <a
                      className="mis-pedidos__pagar"
                      href={`/checkout?pedido=${pedido.id}`}
                    >
                      Continuar con el pago
                    </a>
                    {pedido.estadoPago && (
                      <small>
                        El intento anterior no se completó. Puedes pagar con la
                        misma u otra tarjeta.
                      </small>
                    )}
                  </div>
                )}

                {seccion === "pendientes" && puedeContinuarPago(pedido) && (
                  <div className="mis-pedidos__cancelar-contenedor">
                    <button
                      type="button"
                      className="mis-pedidos__cancelar"
                      disabled={cancelando !== null}
                      onClick={() => cancelarPedido(pedido)}
                    >
                      {cancelando === pedido.id
                        ? "Cancelando..."
                        : "Cancelar pedido"}
                    </button>
                  </div>
                )}

                {seccion === "pendientes" &&
                  !puedeContinuarPago(pedido) &&
                  pedido.estatus === "pendiente" && (
                    <div className="mis-pedidos__accion">
                      <small>
                        {pedido.estadoPago === "creado"
                          ? "Este intento de pago quedó sin completar. Su estado debe verificarse antes de reintentar o cancelar."
                          : "Tu pago está en proceso o requiere verificación. Por seguridad, todavía no puedes reintentar ni cancelar."}
                      </small>
                    </div>
                  )}

                <button
                  className="mis-pedidos__detalle-btn"
                  type="button"
                  aria-expanded={abierto}
                  aria-controls={`detalle-pedido-${pedido.id}`}
                  onClick={() =>
                    setAbiertos((prev) => ({
                      ...prev,
                      [pedido.id]: !prev[pedido.id],
                    }))
                  }
                >
                  {abierto ? "Ocultar detalles −" : "Ver detalles +"}
                </button>
                {abierto && (
                  <div
                    id={`detalle-pedido-${pedido.id}`}
                    className="mis-pedidos__detalle"
                  >
                    <h3>Productos</h3>
                    <div className="mis-pedidos__productos">
                      {pedido.detalles.map((item, i) => (
                        <div
                          className="mis-pedidos__producto"
                          key={`${item.productoId}-${i}`}
                        >
                          <div>
                            <strong>{item.nombreProducto}</strong>
                            {item.variante && <small>{item.variante}</small>}
                            <small>
                              Cantidad: {item.cantidad} · Precio unitario:{" "}
                              {moneda(item.precioUnitario)}
                            </small>
                          </div>
                          <strong>
                            {moneda(item.cantidad * item.precioUnitario)}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <h3>Dirección de envío</h3>
                    <p className="mis-pedidos__direccion">
                      {pedido.direccionEnvio || "No registrada"}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      <style>{`
        .mis-pedidos{max-width:960px;min-height:65vh;margin:0 auto;padding:40px 24px 80px;color:var(--color-text,#3e084e)}
        .mis-pedidos__encabezado{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:28px}
        .mis-pedidos__eyebrow{font-size:11px;letter-spacing:2px;font-weight:800;color:var(--color-purple,#8f1268);margin:0 0 8px}
        .mis-pedidos h1{font-family:var(--font-heading,sans-serif);font-size:clamp(26px,4vw,36px);margin:0;color:var(--color-purple,#8f1268)}
        .mis-pedidos__subtitulo{color:#705c6e;margin:10px 0 0;line-height:1.5}
        .mis-pedidos button{font:inherit;cursor:pointer}
        .mis-pedidos__actualizar{padding:10px 18px;border:1px solid #dbc9d4;border-radius:9px;background:white;color:var(--color-purple,#8f1268);font-weight:700}
        .mis-pedidos__actualizar:disabled{opacity:.5;cursor:wait}
        .mis-pedidos__lista{display:grid;gap:16px}
        .mis-pedidos__tarjeta{border:1px solid #eadce4;border-radius:15px;background:#fff;box-shadow:0 4px 18px #3e084e0a;overflow:hidden}
        .mis-pedidos__fila{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 24px 16px}
        .mis-pedidos__numero{font-size:19px;font-weight:800;margin:0 0 6px}
        .mis-pedidos__fecha{font-size:13px;color:#796b79;margin:0}
        .mis-pedidos__importe{font-size:21px;font-weight:800;white-space:nowrap}
        .mis-pedidos__estados{display:flex;flex-wrap:wrap;gap:14px 28px;padding:0 24px 20px}
        .mis-pedidos__estados>div{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px}
        .mis-pedidos__estados>div>span:first-child{color:#786777}
        .mis-pedidos__estado{display:inline-block;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700}
        .mis-pedidos__estado--ok{background:#e8f6eb;color:#186334}
        .mis-pedidos__estado--pending{background:#fff5df;color:#845800}
        .mis-pedidos__estado--error{background:#ffebeb;color:#a02635}
        .mis-pedidos__detalle-btn{display:block;width:100%;text-align:left;background:#fcf7fa;border:0;border-top:1px solid #f0e5ec;padding:13px 24px;color:var(--color-purple,#8f1268);font-weight:750}
        .mis-pedidos__detalle-btn:hover{background:#f8edf4}
        .mis-pedidos__detalle{padding:22px 24px;border-top:1px solid #f0e5ec}
        .mis-pedidos__detalle h3{font-size:14px;margin:0 0 12px}
        .mis-pedidos__productos{margin-bottom:24px}
        .mis-pedidos__producto{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #f3ebf0;font-size:14px}
        .mis-pedidos__producto small{display:block;color:#796b79;margin-top:5px}
        .mis-pedidos__direccion{margin:0;color:#655665;overflow-wrap:anywhere;line-height:1.6}
        .mis-pedidos__mensaje{padding:30px;text-align:center;color:#796b79}
        .mis-pedidos__vacio{text-align:center;padding:55px 22px;border:1px solid #eadce4;border-radius:15px;background:#fff}
        .mis-pedidos__vacio h2{font-size:20px;margin:0 0 12px}
        .mis-pedidos__vacio p{color:#786777;line-height:1.6}
        .mis-pedidos__vacio button,.mis-pedidos__comprar{display:inline-block;margin-top:12px;padding:11px 20px;background:var(--color-purple,#8f1268);border:0;border-radius:8px;color:#fff;text-decoration:none;font-weight:700}
        @media(max-width:550px){.mis-pedidos{padding:26px 16px 60px}.mis-pedidos__fila{padding:18px 16px 14px}.mis-pedidos__estados{padding:0 16px 18px}.mis-pedidos__detalle{padding:18px 16px}.mis-pedidos__detalle-btn{padding:13px 16px}.mis-pedidos__importe{font-size:18px}}
                .mis-pedidos__accion{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;padding:0 24px 20px}
        .mis-pedidos__pagar{display:inline-block;padding:10px 18px;background:var(--color-purple,#8f1268);border-radius:8px;color:#fff;text-decoration:none;font-weight:700}
        .mis-pedidos__accion small{color:#796b79}
        
.mis-pedidos__pestanas {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  border-bottom: 1px solid #eadce4;
  padding-bottom: 12px;
}

.mis-pedidos__pestanas button {
  border: 1px solid #eadce4;
  border-radius: 9px;
  background: white;
  padding: 11px 18px;
  color: #705c6e;
  font-weight: 700;
  transition: 0.2s;
}

.mis-pedidos__pestanas button.activa {
  background: var(--color-purple, #8f1268);
  color: white;
  border-color: var(--color-purple, #8f1268);
}

.mis-pedidos__cancelar-contenedor {
  padding: 0 24px 20px;
}

.mis-pedidos__cancelar {
  background: white;
  border: 1px solid #c0394c;
  border-radius: 8px;
  padding: 10px 18px;
  color: #c0394c;
  font-weight: 700;
  transition: 0.2s;
}

.mis-pedidos__cancelar:hover {
  background: #fff0f2;
}

.mis-pedidos__cancelar:disabled {
  opacity: 0.5;
  cursor: wait;
}

.mis-pedidos__error-cancelacion {
  background: #fff0f2;
  border: 1px solid #c0394c;
  border-radius: 9px;
  padding: 14px 18px;
  margin-bottom: 20px;
  color: #a02635;
}

      `}</style>
    </section>
  );
}
