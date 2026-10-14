import { useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import EstadoBadge from "./EstadoBadge";
import { dinero, fechaHora } from "./formato";

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

const EN_PROCESO = ["pending", "in_process", "authorized"];
const FALLIDOS = ["rejected", "cancelled", "refunded", "charged_back"];

const FILTROS = [
  ["todos", "Todos", () => true],
  ["aprobados", "Aprobados", (p) => p.estado === "approved"],
  ["proceso", "En proceso", (p) => EN_PROCESO.includes(p.estado)],
  ["fallidos", "Rechazados o devueltos", (p) => FALLIDOS.includes(p.estado)],
  ["sin", "Sin completar", (p) => p.estado === "creado"],
];

/**
 * Lista de solo lectura. Los estados vienen de lo que Mercado Pago
 * confirmó al backend; desde aquí no se puede cambiar ninguno.
 */
export default function PagosAdmin() {
  const acceso = useAdmin();
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    if (acceso.estado !== "listo") return;
    graphqlAuthRequest(PAGOS_QUERY)
      .then((data) => setPagos(data.pagosAdmin))
      .catch((err) => setError(err.message));
  }, [acceso.estado]);

  const visibles = useMemo(() => {
    if (!pagos) return [];
    const condicion = FILTROS.find(([v]) => v === filtro)[2];
    return pagos.filter(condicion);
  }, [pagos, filtro]);

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  const aprobados = pagos ? pagos.filter((p) => p.estado === "approved") : [];

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Mercado Pago</p>
          <h1>Pagos</h1>
        </div>
      </header>

      {error && <div className="admin-aviso-linea">No se pudieron cargar los pagos: {error}</div>}

      {pagos && (
        <section className="tarjetas tarjetas-3" aria-label="Totales de pagos">
          <article className="tarjeta destacada">
            <p className="tarjeta-etiqueta">Cobrado</p>
            <p className="tarjeta-valor">{dinero(aprobados.reduce((s, p) => s + p.monto, 0))}</p>
            <p className="tarjeta-detalle">{aprobados.length} pagos aprobados</p>
          </article>
          <article className="tarjeta">
            <p className="tarjeta-etiqueta">En proceso</p>
            <p className="tarjeta-valor">{pagos.filter((p) => EN_PROCESO.includes(p.estado)).length}</p>
            <p className="tarjeta-detalle">Efectivo o transferencia por acreditar</p>
          </article>
          <article className="tarjeta">
            <p className="tarjeta-etiqueta">Rechazados o devueltos</p>
            <p className="tarjeta-valor">{pagos.filter((p) => FALLIDOS.includes(p.estado)).length}</p>
            <p className="tarjeta-detalle">No generaron cobro</p>
          </article>
        </section>
      )}

      <div className="admin-filtros">
        <div className="admin-segmentos" role="group" aria-label="Filtrar pagos">
          {FILTROS.map(([valor, texto, condicion]) => (
            <button
              key={valor}
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
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.paymentId ?? "—"}</td>
                    <td className="tabla-id">#{p.pedidoId}</td>
                    <td>
                      {p.cliente}
                      <small>{p.email}</small>
                    </td>
                    <td className="tabla-fecha">{fechaHora(p.fecha)}</td>
                    <td className="num">
                      {dinero(p.monto)}
                      {p.moneda !== "MXN" && <small>{p.moneda}</small>}
                    </td>
                    <td>
                      <EstadoBadge estado={p.estado} tipo="pago" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="admin-nota">
          "Sin completar" significa que el cliente abrió Mercado Pago pero no terminó de pagar.
        </p>
      </section>
    </div>
  );
}
