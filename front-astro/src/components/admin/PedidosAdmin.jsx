import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import EstadoBadge from "./EstadoBadge";
import { dinero, fechaHora } from "./formato";

// Los campos pagoId y orderId vienen de PedidoAdminType en back/panel.py.
const PEDIDOS_QUERY = `
  query {
    pedidosAdmin {
      id
      pagoId
      orderId
      cliente
      email
      direccion
      fecha
      total
      estatus
      estadoPago
      paymentId
      detalles { producto variante cantidad precioUnitario subtotal }
    }
  }
`;

const CANCELAR = `
  mutation Cancelar($id: Int!) {
    cancelarPedido(id: $id) { id estatus }
  }
`;

const CONCILIAR = `
  mutation Conciliar($pedidoId: Int!, $orderId: String!) {
    conciliarPago(pedidoId: $pedidoId, orderId: $orderId) {
      pedidoId
      estatusPedido
      estadoPago
      mensaje
    }
  }
`;

const CONFIRMAR_SIN_COBRO = `
  mutation ConfirmarSinCobro($intentoId: Int!, $confirmacion: String!) {
    confirmarSinCobro(intentoId: $intentoId, confirmacion: $confirmacion)
  }
`;

// Los pedidos con incidencias requieren revisión y NO se consideran surtibles.
const PAGADOS = ["pagado", "en_preparacion", "enviado", "entregado"];
const ESTADOS_PAGO_EN_REVISION = [
  "enviando",
  "verificacion",
  "creado",
  "pending",
  "in_process",
  "authorized",
];

const FILTROS = [
  ["todos", "Todos", () => true],
  ["pendientes", "Pendientes de pago", (p) => p.estatus === "pendiente"],
  ["pagados", "Pagados", (p) => PAGADOS.includes(p.estatus)],
  ["incidencias", "Incidencias", (p) => p.estatus.startsWith("incidencia_")],
  [
    "cancelados",
    "Cancelados",
    (p) => p.estatus === "cancelado" || p.estatus === "reembolsado",
  ],
];

export default function PedidosAdmin() {
  const acceso = useAdmin();
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [abierto, setAbierto] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await graphqlAuthRequest(PEDIDOS_QUERY);
      setPedidos(data.pedidosAdmin);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (acceso.estado === "listo") cargar();
  }, [acceso.estado, cargar]);

  const visibles = useMemo(() => {
    if (!pedidos) return [];
    const condicion = FILTROS.find(([v]) => v === filtro)?.[2] ?? FILTROS[0][2];
    const texto = busqueda.trim().toLowerCase();
    const soloNumero = texto.startsWith("#");
    const numero = texto.replace(/^#/, "");

    return pedidos.filter(
      (p) =>
        condicion(p) &&
        (!texto ||
          String(p.id) === numero ||
          (!soloNumero &&
            (p.cliente.toLowerCase().includes(texto) ||
              p.email.toLowerCase().includes(texto)))),
    );
  }, [pedidos, busqueda, filtro]);

  const cancelar = async (pedido) => {
    if (procesando) return;
    if (
      !window.confirm(
        `¿Cancelar el pedido #${pedido.id} de ${pedido.cliente}? El cliente ya no podrá pagarlo.`,
      )
    )
      return;

    setProcesando(true);
    try {
      await graphqlAuthRequest(CANCELAR, { id: pedido.id });
      setAbierto(null);
      setMensaje({
        tipo: "exito",
        texto: `El pedido #${pedido.id} se canceló.`,
      });
      await cargar();
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: `No se pudo cancelar: ${err.message}`,
      });
    } finally {
      setProcesando(false);
    }
  };

  const conciliar = async (pedido) => {
    if (procesando) return;

    const orderId = window.prompt(
      `ID de orden de Mercado Pago para el pedido #${pedido.id}:`,
      pedido.orderId ?? "",
    );
    if (!orderId?.trim()) return;

    setProcesando(true);
    try {
      const data = await graphqlAuthRequest(CONCILIAR, {
        pedidoId: pedido.id,
        orderId: orderId.trim(),
      });
      setAbierto(null);
      setMensaje({
        tipo: "exito",
        texto: `Pedido #${pedido.id}: ${data.conciliarPago.mensaje}`,
      });
      await cargar();
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: `No se pudo conciliar: ${err.message}`,
      });
    } finally {
      setProcesando(false);
    }
  };

  const confirmarSinCobro = async (pedido) => {
    if (procesando || !pedido.pagoId) return;

    const frase = `SIN COBRO ${pedido.pagoId}`;
    const confirmacion = window.prompt(
      "ATENCIÓN: esta acción devuelve al catálogo el inventario reservado.\n\n" +
        "Úsala ÚNICAMENTE después de verificar en Mercado Pago que el intento " +
        "no produjo ningún cobro. No basta con que la solicitud haya fallado " +
        "o no haya respondido.\n\n" +
        `Si ya lo comprobaste, escribe exactamente:\n${frase}`,
    );
    if (confirmacion !== frase) return;

    setProcesando(true);
    try {
      const data = await graphqlAuthRequest(CONFIRMAR_SIN_COBRO, {
        intentoId: pedido.pagoId,
        confirmacion,
      });
      if (data.confirmarSinCobro !== true) {
        throw new Error("No se confirmó la liberación de la reserva.");
      }
      setAbierto(null);
      setMensaje({
        tipo: "exito",
        texto: `Se liberó la reserva del pedido #${pedido.id}.`,
      });
      await cargar();
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: `No se liberó la reserva: ${err.message}`,
      });
    } finally {
      setProcesando(false);
    }
  };

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Compras de la tienda</p>
          <h1>Pedidos</h1>
        </div>
      </header>

      {mensaje && (
        <div
          className={`admin-aviso-linea ${mensaje.tipo === "exito" ? "exito" : ""}`}
          role="status"
        >
          {mensaje.texto}
          <button
            className="admin-cerrar"
            onClick={() => setMensaje(null)}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="admin-aviso-linea">
          No se pudieron cargar los pedidos: {error}
        </div>
      )}

      <div className="admin-filtros">
        <input
          type="search"
          className="admin-input"
          placeholder="Buscar #pedido, cliente o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar pedido"
        />
        <div
          className="admin-segmentos"
          role="group"
          aria-label="Filtrar pedidos"
        >
          {FILTROS.map(([valor, texto, condicion]) => (
            <button
              key={valor}
              className={filtro === valor ? "activo" : ""}
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
            >
              {texto}{" "}
              <span>{pedidos ? pedidos.filter(condicion).length : 0}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="admin-tarjeta">
        {!pedidos ? (
          !error && <p className="admin-cargando">Cargando pedidos…</p>
        ) : visibles.length === 0 ? (
          <p className="admin-vacio">No hay pedidos que coincidan.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="admin-tabla">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th className="num">Productos</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                  <th>Pago</th>
                  <th>
                    <span className="solo-lector">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <td className="tabla-id">#{p.id}</td>
                    <td>
                      {p.cliente}
                      <small>{p.email}</small>
                    </td>
                    <td className="tabla-fecha">{fechaHora(p.fecha)}</td>
                    <td className="num">
                      {p.detalles.reduce((s, d) => s + d.cantidad, 0)}
                    </td>
                    <td className="num">{dinero(p.total)}</td>
                    <td>
                      <EstadoBadge estado={p.estatus} />
                    </td>
                    <td>
                      <EstadoBadge estado={p.estadoPago} tipo="pago" />
                    </td>
                    <td>
                      <div className="acciones">
                        <button
                          className="admin-enlace"
                          onClick={() => setAbierto(p)}
                        >
                          Ver detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {abierto && (
        <DetallePedido
          pedido={abierto}
          onCerrar={() => setAbierto(null)}
          onCancelar={cancelar}
          onConciliar={conciliar}
          onConfirmarSinCobro={confirmarSinCobro}
          procesando={procesando}
        />
      )}
    </div>
  );
}

function DetallePedido({
  pedido,
  onCerrar,
  onCancelar,
  onConciliar,
  onConfirmarSinCobro,
  procesando,
}) {
  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && !procesando && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar, procesando]);

  const incidencia = pedido.estatus.startsWith("incidencia_");
  const pendienteSinCobro =
    pedido.estatus === "pendiente" &&
    (!pedido.estadoPago ||
      ["rejected", "cancelled"].includes(pedido.estadoPago));
  const puedeConciliar =
    Boolean(pedido.orderId) ||
    incidencia ||
    ESTADOS_PAGO_EN_REVISION.includes(pedido.estadoPago);
  const puedeConfirmarSinCobro =
    pedido.estatus === "pendiente" &&
    pedido.estadoPago === "verificacion" &&
    Boolean(pedido.pagoId) &&
    !pedido.orderId;

  return (
    <div
      className="modal-fondo"
      onClick={(e) => !procesando && e.target === e.currentTarget && onCerrar()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pedido"
      >
        <header className="modal-encabezado">
          <h2 id="titulo-pedido">Pedido #{pedido.id}</h2>
          <button
            className="admin-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
            disabled={procesando}
            autoFocus
          >
            ✕
          </button>
        </header>

        <div className="modal-cuerpo">
          <div className="detalle-estados">
            <div>
              <span>Estado del pedido</span>
              <EstadoBadge estado={pedido.estatus} />
            </div>
            <div>
              <span>Pago</span>
              <EstadoBadge estado={pedido.estadoPago} tipo="pago" />
            </div>
            <div>
              <span>Fecha</span>
              {fechaHora(pedido.fecha)}
            </div>
          </div>

          {incidencia && (
            <p className="modal-nota" role="alert">
              Este pedido requiere revisión. Comprueba el cobro y el inventario
              antes de entregar mercancía o tramitar un reembolso.
            </p>
          )}

          <dl className="detalle-datos">
            <dt>Cliente</dt>
            <dd>
              {pedido.cliente} · {pedido.email}
            </dd>
            <dt>Dirección de envío</dt>
            <dd>{pedido.direccion}</dd>
            {pedido.pagoId != null && (
              <>
                <dt>Intento de pago</dt>
                <dd className="mono">#{pedido.pagoId}</dd>
              </>
            )}
            {pedido.orderId && (
              <>
                <dt>Orden Mercado Pago</dt>
                <dd className="mono">{pedido.orderId}</dd>
              </>
            )}
            {pedido.paymentId && (
              <>
                <dt>Operación Mercado Pago</dt>
                <dd className="mono">{pedido.paymentId}</dd>
              </>
            )}
          </dl>

          <table className="admin-tabla tabla-compacta">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Cantidad</th>
                <th className="num">Precio</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedido.detalles.map((d, i) => (
                <tr key={i}>
                  <td>
                    {d.producto}
                    {d.variante && <small>{d.variante}</small>}
                  </td>
                  <td className="num">{d.cantidad}</td>
                  <td className="num">{dinero(d.precioUnitario)}</td>
                  <td className="num">{dinero(d.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{dinero(pedido.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="modal-pie">
          {puedeConciliar && (
            <button
              className="admin-boton secundario"
              onClick={() => onConciliar(pedido)}
              disabled={procesando}
            >
              Conciliar pago
            </button>
          )}

          {puedeConfirmarSinCobro && (
            <button
              className="admin-boton peligro"
              onClick={() => onConfirmarSinCobro(pedido)}
              disabled={procesando}
            >
              Confirmar que no hubo cobro
            </button>
          )}

          {pendienteSinCobro && (
            <button
              className="admin-boton peligro"
              onClick={() => onCancelar(pedido)}
              disabled={procesando}
            >
              Cancelar pedido
            </button>
          )}

          <button
            className="admin-boton secundario"
            onClick={onCerrar}
            disabled={procesando}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
