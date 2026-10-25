import { useCallback, useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import EstadoBadge from "./EstadoBadge";
import GraficaVentas from "./GraficaVentas";
import { dinero, fechaHora } from "./formato";
import { useRefrescarEnVivo } from "./useRefrescarEnVivo";

const DIAS = 30;

const RESUMEN_QUERY = `
  query ResumenAdmin($dias: Int!) {
    resumenAdmin(dias: $dias) {
      ventasTotales
      ventasMes
      numPedidos
      pedidosPagados
      pedidosPendientes
      productosActivos
      productosStockBajo
      productosAgotados
      umbralStockBajo
      ventasPorDia { fecha total pedidos }
      alertasStock { id nombre stock }
      pedidosRecientes { id cliente email fecha total estatus estadoPago }
    }
  }
`;

export default function ResumenAdmin() {
  const acceso = useAdmin();
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await graphqlAuthRequest(RESUMEN_QUERY, { dias: DIAS });
      setResumen(data.resumenAdmin);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (acceso.estado === "listo") cargar();
  }, [acceso.estado, cargar]);


  useRefrescarEnVivo(cargar);

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  const mes = new Date().toLocaleDateString("es-MX", { month: "long" });
  const ticketPromedio =
    resumen && resumen.pedidosPagados > 0
      ? resumen.ventasTotales / resumen.pedidosPagados
      : 0;

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Hola, {acceso.usuario.nombre}</p>
          <h1>Resumen</h1>
        </div>
        <button className="admin-boton secundario" onClick={cargar} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {error && (
        <div className="admin-aviso-linea">
          No se pudo cargar el resumen: {error}
        </div>
      )}

      {!resumen ? (
        !error && <p className="admin-cargando">Cargando datos…</p>
      ) : (
        <>
          <section className="tarjetas" aria-label="Indicadores principales">

            <Tarjeta
              etiqueta="Ventas confirmadas"
              valor={dinero(resumen.ventasTotales)}
              detalle={`${resumen.pedidosPagados} pedidos pagados`}
              destacada
            />
            <Tarjeta
              etiqueta={`Ventas de ${mes}`}
              valor={dinero(resumen.ventasMes)}
              detalle="Solo pagos confirmados"
            />
            <Tarjeta
              etiqueta="Ticket promedio"
              valor={dinero(ticketPromedio)}
              detalle="Por pedido pagado"
            />
            <Tarjeta
              etiqueta="Pedidos"
              valor={resumen.numPedidos}
              detalle="Todos los estados"
            />
            <Tarjeta
              etiqueta="Pendientes de pago"
              valor={resumen.pedidosPendientes}
              detalle="El cliente no terminó de pagar"
            />
            <Tarjeta
              etiqueta="Productos activos"
              valor={resumen.productosActivos}
              detalle="Visibles en la tienda"
            />
            <Tarjeta
              etiqueta="Stock bajo"
              valor={resumen.productosStockBajo}
              detalle={`${resumen.umbralStockBajo} piezas o menos · ${resumen.productosAgotados} ${resumen.productosAgotados === 1 ? "agotado" : "agotados"
                }`}
              alerta={resumen.productosStockBajo > 0 ? "Revisar" : null}
            />
          </section>

          <div className="admin-columnas">
            <section className="admin-tarjeta">
              <GraficaVentas
                datos={resumen.ventasPorDia}
                titulo="Ventas confirmadas"
                subtitulo={`Últimos ${DIAS} días · ${dinero(
                  resumen.ventasPorDia.reduce((s, d) => s + d.total, 0),
                )}`}
              />
            </section>

            <section className="admin-tarjeta">
              <div className="admin-tarjeta-titulo">
                <div>
                  <h2>Alertas de inventario</h2>
                  <p>{resumen.umbralStockBajo} piezas o menos</p>
                </div>
              </div>
              <AlertasStock productos={resumen.alertasStock} />
            </section>
          </div>

          <section className="admin-tarjeta">
            <div className="admin-tarjeta-titulo">
              <h2>Pedidos recientes</h2>
            </div>
            <TablaPedidos pedidos={resumen.pedidosRecientes} />
          </section>
        </>
      )}
    </div>
  );
}

function Tarjeta({ etiqueta, valor, detalle, alerta, destacada }) {
  return (
    <article className={`tarjeta${destacada ? " destacada" : ""}`}>
      <p className="tarjeta-etiqueta">{etiqueta}</p>
      <p className="tarjeta-valor">{valor}</p>
      <p className="tarjeta-detalle">
        {alerta && (
          <span className="badge badge-aviso">
            <span aria-hidden="true">!</span>
            {alerta}
          </span>
        )}
        {detalle}
      </p>
    </article>
  );
}

function TablaPedidos({ pedidos }) {
  if (pedidos.length === 0) {
    return <p className="admin-vacio">Todavía no hay pedidos.</p>;
  }

  return (
    <div className="tabla-desplazable">
      <table className="admin-tabla">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th className="num">Total</th>
            <th>Estado</th>
            <th>Pago</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td className="tabla-id">#{p.id}</td>
              <td>
                {p.cliente}
                <small>{p.email}</small>
              </td>
              <td className="tabla-fecha">{fechaHora(p.fecha)}</td>
              <td className="num">{dinero(p.total)}</td>
              <td><EstadoBadge estado={p.estatus} /></td>
              <td><EstadoBadge estado={p.estadoPago} tipo="pago" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertasStock({ productos }) {
  if (productos.length === 0) {
    return <p className="admin-vacio">Todo el inventario está en buen nivel.</p>;
  }

  return (
    <ul className="alertas">
      {productos.map((p) => (
        <li key={p.id}>
          <span>{p.nombre}</span>
          {p.stock === 0 ? (
            <span className="badge badge-critico">
              <span aria-hidden="true">✕</span>Agotado
            </span>
          ) : (
            <span className="badge badge-aviso">
              <span aria-hidden="true">!</span>
              {p.stock} {p.stock === 1 ? "pieza" : "piezas"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
