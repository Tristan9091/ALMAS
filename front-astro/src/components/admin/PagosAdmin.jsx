import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import EstadoBadge from "./EstadoBadge";
import { dinero, fechaHora } from "./formato";
import { useRefrescarEnVivo } from "./useRefrescarEnVivo";

const PAGOS_QUERY = `
  query {
    pagosAdmin {
      id
      pedidoId
      cliente
      email
      monto
      moneda
      estado
      estadoDetalle
      paymentId
      fecha
    }
  }
`;

// Estados del intento de cobro, no del pedido.
const EN_PROCESO = [
  "enviando",
  "pending",
  "in_process",
  "authorized",
  "verificacion",
];
const FALLIDOS = ["rejected", "cancelled", "refunded", "charged_back"];

const FILTROS = [
  ["todos", "Todos", () => true],
  ["aprobados", "Aprobados", (p) => p.estado === "approved"],
  ["proceso", "En proceso", (p) => EN_PROCESO.includes(p.estado)],
  ["verificar", "Por verificar", (p) => p.estado === "verificacion"],
  ["fallidos", "Rechazados o devueltos", (p) => FALLIDOS.includes(p.estado)],
  ["sin", "Sin confirmar", (p) => p.estado === "creado"],
];

/**
 * Historial de intentos de pago. Esta vista es de solo lectura.
 * La conciliación con Mercado Pago se hace desde PedidosAdmin.
 * Un estado incierto NO indica que se pueda cobrar de nuevo.
 */
export default function PagosAdmin() {
  const acceso = useAdmin();
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("todos");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await graphqlAuthRequest(PAGOS_QUERY);
      setPagos(data.pagosAdmin ?? []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los pagos.");
    } finally {
      setCargando(false);
    }
  }, []);
  
  useEffect(() => {
    if (acceso.estado === "listo") cargar();
  }, [acceso.estado, cargar]);

  // Los intentos de pago cambian con los eventos de pago.
  useRefrescarEnVivo(cargar, ["pago_"]);

  const visibles = useMemo(() => {
    if (!pagos) return [];
    const condicion =
      FILTROS.find(([valor]) => valor === filtro)?.[2] ?? (() => true);
    return pagos.filter(condicion);
  }, [pagos, filtro]);

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  const aprobados = pagos?.filter((p) => p.estado === "approved") ?? [];
  const enProceso = pagos?.filter((p) => EN_PROCESO.includes(p.estado)) ?? [];
  const porVerificar = pagos?.filter((p) => p.estado === "verificacion") ?? [];
  const fallidos = pagos?.filter((p) => FALLIDOS.includes(p.estado)) ?? [];

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Mercado Pago</p>
          <h1>Pagos</h1>
        </div>
        <button
          type="button"
          className="admin-boton secundario"
          onClick={cargar}
          disabled={cargando}
        >
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {error && (
        <div className="admin-aviso-linea" role="alert">
          No se pudieron cargar los pagos: {error}
        </div>
      )}

      {pagos && (
        <section className="tarjetas tarjetas-3" aria-label="Totales de pagos">
          <article className="tarjeta destacada">
            <p className="tarjeta-etiqueta">Pagos aprobados</p>
            <p className="tarjeta-valor">
              {dinero(aprobados.reduce((suma, pago) => suma + pago.monto, 0))}
            </p>
            <p className="tarjeta-detalle">
              {aprobados.length} intentos aprobados; no equivale a ventas netas
            </p>
          </article>
          <article className="tarjeta">
            <p className="tarjeta-etiqueta">En proceso</p>
            <p className="tarjeta-valor">{enProceso.length}</p>
            <p className="tarjeta-detalle">
              {porVerificar.length} requieren verificación
            </p>
          </article>
          <article className="tarjeta">
            <p className="tarjeta-etiqueta">Rechazados o devueltos</p>
            <p className="tarjeta-valor">{fallidos.length}</p>
            <p className="tarjeta-detalle">Incluye reembolsos y contracargos</p>
          </article>
        </section>
      )}

      {porVerificar.length > 0 && (
        <div className="admin-aviso-linea" role="status">
          Hay {porVerificar.length} intento(s) con resultado incierto. Consulta
          la operación en Mercado Pago y usa la conciliación desde Pedidos. No
          solicites un segundo pago sin comprobar el primero.
        </div>
      )}

      <div className="admin-filtros">
        <div
          className="admin-segmentos"
          role="group"
          aria-label="Filtrar pagos"
        >
          {FILTROS.map(([valor, texto, condicion]) => (
            <button
              key={valor}
              type="button"
              className={filtro === valor ? "activo" : ""}
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
            >
              {texto} <span>{pagos ? pagos.filter(condicion).length : 0}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="admin-tarjeta">
        {!pagos ? (
          !error && <p className="admin-cargando">Cargando pagos…</p>
        ) : visibles.length === 0 ? (
          <p className="admin-vacio">No hay pagos que coincidan.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="admin-tabla">
              <thead>
                <tr>
                  <th>Operación</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th className="num">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((pago) => (
                  <tr key={pago.id}>
                    <td className="mono">
                      {pago.paymentId ?? "—"}
                      <small>Intento #{pago.id}</small>
                    </td>
                    <td className="tabla-id">#{pago.pedidoId}</td>
                    <td>
                      {pago.cliente}
                      <small>{pago.email}</small>
                    </td>
                    <td className="tabla-fecha">{fechaHora(pago.fecha)}</td>
                    <td className="num">
                      {dinero(pago.monto)}
                      {pago.moneda !== "MXN" && <small>{pago.moneda}</small>}
                    </td>
                    <td>
                      <EstadoBadge estado={pago.estado} tipo="pago" />
                      {pago.estadoDetalle && (
                        <small>{pago.estadoDetalle}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="admin-nota">
          Los estados describen intentos de cobro. «Sin confirmar» o «Requiere
          verificación» no garantizan que no exista un cargo. La conciliación se
          realiza desde la sección Pedidos.
        </p>
      </section>
    </div>
  );
}
