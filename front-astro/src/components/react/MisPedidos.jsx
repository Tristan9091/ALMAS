import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { traducir, rutaLocalizada } from "../../i18n/utils";

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
  pendiente: ["Pendiente de pago", "Awaiting payment"],
  pagado: ["Pagado", "Paid"],
  en_preparacion: ["En preparación", "Preparing order"],
  enviado: ["Enviado", "Shipped"],
  entregado: ["Entregado", "Delivered"],
  cancelado: ["Cancelado", "Cancelled"],
  reembolsado: ["Reembolsado", "Refunded"],

  incidencia_stock: ["Revisión de inventario", "Inventory review"],

  incidencia_monto: ["Revisión del importe", "Amount review"],

  incidencia_duplicado: [
    "Revisión de cobro duplicado",
    "Duplicate payment review",
  ],

  incidencia_cancelado: ["Revisión de cobro", "Payment review"],

  incidencia_tardia: ["Revisión de cobro", "Payment review"],

  incidencia_sin_intento: ["Revisión de cobro", "Payment review"],
};

const ETIQUETAS_PAGO = {
  approved: ["Aprobado", "Approved"],
  authorized: ["Autorizado", "Authorized"],
  pending: ["Pendiente", "Pending"],
  in_process: ["En proceso", "In progress"],
  rejected: ["Rechazado", "Declined"],
  cancelled: ["Cancelado", "Cancelled"],
  refunded: ["Reembolsado", "Refunded"],
  charged_back: ["Contracargo", "Chargeback"],
  creado: ["Sin completar", "Incomplete"],
  enviando: ["Procesando", "Processing"],
  verificacion: ["En verificación", "Under verification"],
};

// Solo permite retomar un pago cuando no existe
// un cobro abierto o pendiente de verificación.
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
  if (["pagado", "entregado", "approved"].includes(estado)) {
    return "ok";
  }

  if (
    [
      "cancelado",
      "reembolsado",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
    ].includes(estado)
  ) {
    return "error";
  }

  if (estado?.startsWith("incidencia_") || estado === "verificacion") {
    return "error";
  }

  return "pending";
}

function moneda(valor, idioma) {
  return new Intl.NumberFormat(idioma === "en" ? "en-US" : "es-MX", {
    style: "currency",
    currency: "MXN",
    currencyDisplay: "code",
  }).format(Number(valor) || 0);
}

function fechaLegible(valor, idioma) {
  const noDisponible = traducir(
    idioma,
    "Fecha no disponible",
    "Date unavailable",
  );

  if (!valor) return noDisponible;

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return noDisponible;
  }

  return new Intl.DateTimeFormat(idioma === "en" ? "en-US" : "es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(fecha);
}

function Estado({ estado, tipo, idioma }) {
  const etiquetas = tipo === "pago" ? ETIQUETAS_PAGO : ETIQUETAS_PEDIDO;

  const etiqueta = etiquetas[estado];

  const texto = !estado
    ? traducir(idioma, "Sin pago registrado", "No payment recorded")
    : etiqueta
      ? traducir(idioma, etiqueta[0], etiqueta[1])
      : estado.replaceAll("_", " ");

  return (
    <span
      className={`mis-pedidos__estado mis-pedidos__estado--${tono(estado)}`}
    >
      {texto}
    </span>
  );
}

export default function MisPedidos({ idioma = "es" }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [abiertos, setAbiertos] = useState({});
  const [seccion, setSeccion] = useState("compras");

  const [cancelando, setCancelando] = useState(null);

  const [errorCancelacion, setErrorCancelacion] = useState("");

  const t = (es, en) => traducir(idioma, es, en);

  const ruta = (path) => rutaLocalizada(path, idioma);

  async function cargar() {
    if (!localStorage.getItem("almas-token")) {
      window.location.replace(ruta("/login"));
      return;
    }

    setCargando(true);
    setError("");

    try {
      const datos = await graphqlAuthRequest(MIS_PEDIDOS);

      setPedidos(datos?.misPedidos || []);
    } catch (err) {
      console.error(err);

      setError(
        idioma === "es"
          ? err?.message || "No se pudo cargar el historial de pedidos."
          : "Could not load your order history.",
      );
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
      t(
        `¿Quieres cancelar el pedido #${pedido.id}?\n\nEsta acción no se puede deshacer. Si quieres comprar estos productos después, tendrás que hacer un nuevo pedido.`,
        `Do you want to cancel order #${pedido.id}?\n\nThis action cannot be undone. If you want to buy these products later, you will need to create a new order.`,
      ),
    );

    if (!confirmar) return;

    setCancelando(pedido.id);
    setErrorCancelacion("");

    try {
      const resultado = await graphqlAuthRequest(CANCELAR_MI_PEDIDO, {
        pedidoId: pedido.id,
      });

      if (resultado?.cancelarMiPedido !== true) {
        throw new Error(
          t(
            "No se pudo confirmar la cancelación.",
            "Could not confirm the cancellation.",
          ),
        );
      }

      await cargar();
    } catch (err) {
      console.error(err);

      setErrorCancelacion(
        idioma === "es"
          ? err?.message || "No se pudo cancelar el pedido."
          : "Could not cancel the order. Please check its current status.",
      );
    } finally {
      setCancelando(null);
    }
  }

  return (
    <section
      className="mis-pedidos"
      aria-label={t("Historial de pedidos", "Order history")}
    >
      <div className="mis-pedidos__encabezado">
        <div>
          <p className="mis-pedidos__eyebrow">
            {t("TU CUENTA", "YOUR ACCOUNT")}
          </p>

          <h1>{t("Mis pedidos", "My orders")}</h1>

          <p className="mis-pedidos__subtitulo">
            {t(
              "Consulta tus compras y el estado de cada pedido.",
              "View your purchases and track the status of each order.",
            )}
          </p>
        </div>

        <button
          className="mis-pedidos__actualizar"
          type="button"
          onClick={cargar}
          disabled={cargando}
        >
          {cargando
            ? t("Actualizando…", "Refreshing…")
            : t("Actualizar", "Refresh")}
        </button>
      </div>

      <div
        className="mis-pedidos__pestanas"
        role="group"
        aria-label={t("Secciones de pedidos", "Order sections")}
      >
        <button
          type="button"
          className={seccion === "compras" ? "activa" : ""}
          aria-pressed={seccion === "compras"}
          onClick={() => setSeccion("compras")}
        >
          {t("Mis compras", "My purchases")} ({compras.length})
        </button>

        <button
          type="button"
          className={seccion === "pendientes" ? "activa" : ""}
          aria-pressed={seccion === "pendientes"}
          onClick={() => setSeccion("pendientes")}
        >
          {t("Pagos pendientes", "Pending payments")} ({pagosPendientes.length})
        </button>
      </div>

      {errorCancelacion && (
        <p className="mis-pedidos__error-cancelacion" role="alert">
          {errorCancelacion}
        </p>
      )}

      {cargando && (
        <p className="mis-pedidos__mensaje" role="status">
          {t("Cargando tus pedidos…", "Loading your orders…")}
        </p>
      )}

      {!cargando && error && (
        <div className="mis-pedidos__vacio" role="alert">
          <h2>
            {t(
              "No pudimos consultar tus pedidos",
              "We could not load your orders",
            )}
          </h2>

          <p>{error}</p>

          <button type="button" onClick={cargar}>
            {t("Intentar de nuevo", "Try again")}
          </button>

          <p>
            {t("Si tu sesión venció,", "If your session has expired,")}{" "}
            <a href={ruta("/login")}>
              {t("vuelve a iniciar sesión", "sign in again")}
            </a>
            .
          </p>
        </div>
      )}

      {!cargando && !error && pedidosVisibles.length === 0 && (
        <div className="mis-pedidos__vacio">
          <h2>
            {seccion === "compras"
              ? t("Aún no tienes compras", "You have no purchases yet")
              : t("No tienes pagos pendientes", "You have no pending payments")}
          </h2>

          <p>
            {seccion === "compras"
              ? t(
                  "Cuando completes una compra, podrás consultar aquí su información.",
                  "Once you complete a purchase, its information will appear here.",
                )
              : t(
                  "Los pedidos pendientes o rechazados aparecerán aquí.",
                  "Orders awaiting payment or with declined payments will appear here.",
                )}
          </p>

          <a className="mis-pedidos__comprar" href={ruta("/")}>
            {t("Explorar catálogo", "Browse catalog")}
          </a>
        </div>
      )}

      {!cargando && !error && pedidosVisibles.length > 0 && (
        <div className="mis-pedidos__lista">
          {pedidosVisibles.map((pedido) => {
            const abierto = !!abiertos[pedido.id];

            return (
              <article className="mis-pedidos__tarjeta" key={pedido.id}>
                <div className="mis-pedidos__fila">
                  <div>
                    <p className="mis-pedidos__numero">
                      {t("Pedido", "Order")} #{pedido.id}
                    </p>

                    <p className="mis-pedidos__fecha">
                      {fechaLegible(pedido.fecha, idioma)}
                    </p>
                  </div>

                  <div className="mis-pedidos__importe">
                    {moneda(pedido.total, idioma)}
                  </div>
                </div>

                <div className="mis-pedidos__estados">
                  <div>
                    <span>{t("Pedido", "Order")}</span>

                    <Estado
                      estado={pedido.estatus}
                      tipo="pedido"
                      idioma={idioma}
                    />
                  </div>

                  <div>
                    <span>{t("Pago", "Payment")}</span>

                    <Estado
                      estado={pedido.estadoPago}
                      tipo="pago"
                      idioma={idioma}
                    />
                  </div>
                </div>

                {puedeContinuarPago(pedido) && (
                  <div className="mis-pedidos__accion">
                    <a
                      className="mis-pedidos__pagar"
                      href={`${ruta("/checkout")}?pedido=${pedido.id}`}
                    >
                      {t("Continuar con el pago", "Continue payment")}
                    </a>

                    {pedido.estadoPago && (
                      <small>
                        {t(
                          "El intento anterior no se completó. Puedes pagar con la misma u otra tarjeta.",
                          "The previous payment attempt was not completed. You can pay using the same or a different card.",
                        )}
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
                        ? t("Cancelando...", "Cancelling...")
                        : t("Cancelar pedido", "Cancel order")}
                    </button>
                  </div>
                )}

                {seccion === "pendientes" &&
                  !puedeContinuarPago(pedido) &&
                  pedido.estatus === "pendiente" && (
                    <div className="mis-pedidos__accion">
                      <small>
                        {pedido.estadoPago === "creado"
                          ? t(
                              "Este intento de pago quedó sin completar. Su estado debe verificarse antes de reintentar o cancelar.",
                              "This payment attempt was incomplete. Its status must be verified before retrying or cancelling.",
                            )
                          : t(
                              "Tu pago está en proceso o requiere verificación. Por seguridad, todavía no puedes reintentar ni cancelar.",
                              "Your payment is being processed or requires verification. For security reasons, you cannot retry or cancel it yet.",
                            )}
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
                  {abierto
                    ? t("Ocultar detalles −", "Hide details −")
                    : t("Ver detalles +", "View details +")}
                </button>

                {abierto && (
                  <div
                    id={`detalle-pedido-${pedido.id}`}
                    className="mis-pedidos__detalle"
                  >
                    <h3>{t("Productos", "Products")}</h3>

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
                              {t("Cantidad", "Quantity")}: {item.cantidad}
                              {" · "}
                              {t("Precio unitario", "Unit price")}:{" "}
                              {moneda(item.precioUnitario, idioma)}
                            </small>
                          </div>

                          <strong>
                            {moneda(
                              item.cantidad * item.precioUnitario,
                              idioma,
                            )}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <h3>{t("Dirección de envío", "Shipping address")}</h3>

                    <p className="mis-pedidos__direccion">
                      {pedido.direccionEnvio ||
                        t("No registrada", "Not registered")}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <style>{`
        .mis-pedidos {
          width: 100%;
          max-width: 960px;
          min-width: 0;
          min-height: 65vh;
          min-height: 65dvh;

          margin: 0 auto;
          padding: 24px var(--page-padding) 48px;

          color: var(--color-text, #3e084e);
          overflow-wrap: anywhere;
        }

        .mis-pedidos__encabezado {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }

        .mis-pedidos__eyebrow {
          font-size: 11px;
          letter-spacing: 2px;
          font-weight: 800;
          color: var(--color-purple, #8f1268);
          margin: 0 0 8px;
        }

        .mis-pedidos h1 {
          font-family: var(--font-heading, sans-serif);
          font-size: 26px;
          margin: 0;
          color: var(--color-purple, #8f1268);
        }

        .mis-pedidos__subtitulo {
          color: #705c6e;
          margin: 10px 0 0;
          line-height: 1.5;
        }

        .mis-pedidos button {
          font: inherit;
          cursor: pointer;
          min-height: 44px;
          max-width: 100%;
        }

        .mis-pedidos__actualizar {
          width: 100%;
          padding: 10px 18px;
          border: 1px solid #dbc9d4;
          border-radius: 9px;
          background: white;
          color: var(--color-purple, #8f1268);
          font-weight: 700;
        }

        .mis-pedidos__actualizar:disabled {
          opacity: .5;
          cursor: wait;
        }

        .mis-pedidos__lista {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
        }

        .mis-pedidos__tarjeta {
          min-width: 0;
          border: 1px solid #eadce4;
          border-radius: 15px;
          background: #fff;
          box-shadow: 0 4px 18px #3e084e0a;
          overflow: hidden;
        }

        .mis-pedidos__fila {
          display: flex;
          align-items: flex-start;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
        }

        .mis-pedidos__fila > div {
          min-width: 0;
        }

        .mis-pedidos__numero {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 6px;
        }

        .mis-pedidos__fecha {
          font-size: 13px;
          color: #796b79;
          margin: 0;
        }

        .mis-pedidos__importe {
          font-size: 18px;
          font-weight: 800;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .mis-pedidos__estados {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 0 16px 18px;
        }

        .mis-pedidos__estados > div {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 13px;
          min-width: 0;
        }

        .mis-pedidos__estados > div > span:first-child {
          color: #786777;
        }

        .mis-pedidos__estado {
          display: inline-block;
          max-width: 100%;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .mis-pedidos__estado--ok {
          background: #e8f6eb;
          color: #186334;
        }

        .mis-pedidos__estado--pending {
          background: #fff5df;
          color: #845800;
        }

        .mis-pedidos__estado--error {
          background: #ffebeb;
          color: #a02635;
        }

        .mis-pedidos__detalle-btn {
          display: block;
          width: 100%;
          text-align: left;
          background: #fcf7fa;
          border: 0;
          border-top: 1px solid #f0e5ec;
          padding: 13px 16px;
          color: var(--color-purple, #8f1268);
          font-weight: 750;
        }

        .mis-pedidos__detalle-btn:hover {
          background: #f8edf4;
        }

        .mis-pedidos__detalle {
          padding: 18px 16px;
          border-top: 1px solid #f0e5ec;
        }

        .mis-pedidos__detalle h3 {
          font-size: 14px;
          margin: 0 0 12px;
        }

        .mis-pedidos__productos {
          margin-bottom: 24px;
        }

        .mis-pedidos__producto {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 0;
          border-bottom: 1px solid #f3ebf0;
          font-size: 14px;
        }

        .mis-pedidos__producto > div {
          min-width: 0;
        }

        .mis-pedidos__producto small {
          display: block;
          color: #796b79;
          margin-top: 5px;
          line-height: 1.5;
        }

        .mis-pedidos__direccion {
          margin: 0;
          color: #655665;
          overflow-wrap: anywhere;
          line-height: 1.6;
        }

        .mis-pedidos__mensaje {
          padding: 24px 12px;
          text-align: center;
          color: #796b79;
        }

        .mis-pedidos__vacio {
          text-align: center;
          padding: 32px 16px;
          border: 1px solid #eadce4;
          border-radius: 15px;
          background: #fff;
        }

        .mis-pedidos__vacio h2 {
          font-size: 20px;
          margin: 0 0 12px;
        }

        .mis-pedidos__vacio p {
          color: #786777;
          line-height: 1.6;
        }

        .mis-pedidos__vacio button,
        .mis-pedidos__comprar {
          display: inline-flex;
          align-items: center;
          justify-content: center;

          min-height: 44px;
          max-width: 100%;
          margin-top: 12px;
          padding: 11px 20px;

          background: var(--color-purple, #8f1268);
          border: 0;
          border-radius: 8px;
          color: #fff;
          text-decoration: none;
          font-weight: 700;
        }

        .mis-pedidos__accion {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 14px;
          padding: 0 16px 18px;
        }

        .mis-pedidos__pagar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 44px;
          padding: 10px 18px;
          border-radius: 8px;
          background: var(--color-purple, #8f1268);
          color: #fff;
          text-decoration: none;
          text-align: center;
          font-weight: 700;
        }

        .mis-pedidos__accion small {
          color: #796b79;
          line-height: 1.5;
        }

        .mis-pedidos__pestanas {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          border-bottom: 1px solid #eadce4;
          padding-bottom: 12px;
        }

        .mis-pedidos__pestanas button {
          border: 1px solid #eadce4;
          border-radius: 9px;
          background: white;
          padding: 11px 14px;
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
          padding: 0 16px 18px;
        }

        .mis-pedidos__cancelar {
          width: 100%;
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

        .mis-pedidos button:focus-visible,
        .mis-pedidos a:focus-visible {
          outline: 3px solid var(--color-purple);
          outline-offset: 3px;
        }

        /* Teléfonos */

        @media (min-width: 360px) {
          .mis-pedidos {
            padding-top: 28px;
          }

          .mis-pedidos h1 {
            font-size: 28px;
          }

          .mis-pedidos__pestanas {
            flex-direction: row;
            flex-wrap: wrap;
          }

          .mis-pedidos__pestanas button {
            flex: 1 1 120px;
            min-width: 0;
          }

          .mis-pedidos__producto {
            flex-direction: row;
            align-items: flex-start;
          }
        }

        /* Tabletas */

        @media (min-width: 768px) {
          .mis-pedidos {
            padding-top: 40px;
            padding-bottom: 64px;
          }

          .mis-pedidos h1 {
            font-size: 32px;
          }

          .mis-pedidos__encabezado {
            flex-direction: row;
            align-items: center;
          }

          .mis-pedidos__actualizar {
            width: auto;
            flex-shrink: 0;
          }

          .mis-pedidos__pestanas button {
            flex: initial;
            padding-inline: 18px;
          }

          .mis-pedidos__fila {
            padding: 22px 24px 16px;
          }

          .mis-pedidos__importe {
            font-size: 21px;
          }

          .mis-pedidos__estados {
            gap: 14px 28px;
            padding: 0 24px 20px;
          }

          .mis-pedidos__detalle {
            padding: 22px 24px;
          }

          .mis-pedidos__detalle-btn {
            padding: 13px 24px;
          }

          .mis-pedidos__accion,
          .mis-pedidos__cancelar-contenedor {
            padding: 0 24px 20px;
          }

          .mis-pedidos__pagar,
          .mis-pedidos__cancelar {
            width: auto;
          }

          .mis-pedidos__vacio {
            padding: 55px 22px;
          }
        }

        /* Escritorio */

        @media (min-width: 1200px) {
          .mis-pedidos {
            padding-bottom: 80px;
          }

          .mis-pedidos h1 {
            font-size: 36px;
          }

          .mis-pedidos__lista {
            gap: 20px;
          }
        }

        /* Orientación horizontal */

        @media (orientation: landscape)
          and (max-height: 500px) {
          .mis-pedidos {
            padding-top: 16px;
            padding-bottom: 32px;
          }
        }
      `}</style>
    </section>
  );
}
