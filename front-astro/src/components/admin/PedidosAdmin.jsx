import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import EstadoBadge from "./EstadoBadge";
import { dinero, fechaHora } from "./formato";

const PEDIDOS_QUERY = `
  query {
    pedidosAdmin {
      id
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

// Pedidos con el pago confirmado (cuentan como venta).
const PAGADOS = ["pagado", "en_preparacion", "enviado", "entregado"];

const FILTROS = [
  ["todos", "Todos", () => true],
  ["pendientes", "Pendientes de pago", (p) => p.estatus === "pendiente"],
  ["pagados", "Pagados", (p) => PAGADOS.includes(p.estatus)],
  ["cancelados", "Cancelados", (p) => p.estatus === "cancelado" || p.estatus === "reembolsado"],
];

export default function PedidosAdmin() {
  const acceso = useAdmin();
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [abierto, setAbierto] = useState(null);
  const [mensaje, setMensaje] = useState(null);

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
    const condicion = FILTROS.find(([v]) => v === filtro)[2];
    const texto = busqueda.trim().toLowerCase();
    // "#12" busca solo el número de pedido; cualquier otro texto busca
    // también en el nombre y el correo del cliente.
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
    if (
      !window.confirm(
        `¿Cancelar el pedido #${pedido.id} de ${pedido.cliente}? El cliente ya no podrá pagarlo.`,
      )
    )
      return;

    try {
      await graphqlAuthRequest(CANCELAR, { id: pedido.id });
      setAbierto(null);
      setMensaje({ tipo: "exito", texto: `El pedido #${pedido.id} se canceló.` });
      cargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: `No se pudo cancelar: ${err.message}` });
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
        <div className={`admin-aviso-linea ${mensaje.tipo === "exito" ? "exito" : ""}`} role="status">
          {mensaje.texto}
          <button className="admin-cerrar" onClick={() => setMensaje(null)} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {error && <div className="admin-aviso-linea">No se pudieron cargar los pedidos: {error}</div>}

      <div className="admin-filtros">
        <input
          type="search"
          className="admin-input"
          placeholder="Buscar #pedido, cliente o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar pedido"
        />
        <div className="admin-segmentos" role="group" aria-label="Filtrar pedidos">
          {FILTROS.map(([valor, texto, condicion]) => (
            <button
              key={valor}
              className={filtro === valor ? "activo" : ""}
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
            >
              {texto} <span>{pedidos ? pedidos.filter(condicion).length : 0}</span>
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
                  <th><span className="solo-lector">Acciones</span></th>
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
                    <td><EstadoBadge estado={p.estatus} /></td>
                    <td><EstadoBadge estado={p.estadoPago} tipo="pago" /></td>
                    <td>
                      <div className="acciones">
                        <button className="admin-enlace" onClick={() => setAbierto(p)}>
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
        <DetallePedido pedido={abierto} onCerrar={() => setAbierto(null)} onCancelar={cancelar} />
      )}
    </div>
  );
}

function DetallePedido({ pedido, onCerrar, onCancelar }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-pedido">
        <header className="modal-encabezado">
          <h2 id="titulo-pedido">Pedido #{pedido.id}</h2>
          <button className="admin-cerrar" onClick={onCerrar} aria-label="Cerrar" autoFocus>
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

          <dl className="detalle-datos">
            <dt>Cliente</dt>
            <dd>
              {pedido.cliente} · {pedido.email}
            </dd>
            <dt>Dirección de envío</dt>
            <dd>{pedido.direccion}</dd>
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
          {pedido.estatus === "pendiente" ? (
            <>
              <p className="modal-nota">El cliente todavía no paga este pedido.</p>
              <button className="admin-boton peligro" onClick={() => onCancelar(pedido)}>
                Cancelar pedido
              </button>
            </>
          ) : (
            <button className="admin-boton secundario" onClick={onCerrar}>
              Cerrar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
