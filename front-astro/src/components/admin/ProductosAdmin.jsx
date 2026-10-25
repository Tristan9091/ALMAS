import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest, graphqlRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import FormularioProducto from "./FormularioProducto";
import { dinero } from "./formato";
import { useRefrescarEnVivo } from "./useRefrescarEnVivo";

const STOCK_BAJO = 3;

const PRODUCTOS_QUERY = `
  query {
    productosAdmin {
      id
      nombre
      descripcion
      precio
      imagenUrl
      stock
      categoriaId
      activo
    }
  }
`;

const CATEGORIAS_QUERY = `
  query {
    categorias {
      id
      nombre
    }
  }
`;

const CAMBIAR_ESTADO = `
  mutation CambiarEstado($id: Int!, $activo: Boolean!) {
    cambiarEstadoProducto(id: $id, activo: $activo) {
      id
      activo
    }
  }
`;

export default function ProductosAdmin() {
  const acceso = useAdmin();

  const [productos, setProductos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");

  // null = formulario cerrado; {} = nuevo producto; {...producto} = editar
  const [editando, setEditando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [p, c] = await Promise.all([
        graphqlAuthRequest(PRODUCTOS_QUERY),
        graphqlRequest(CATEGORIAS_QUERY),
      ]);
      setProductos(p.productosAdmin);
      setCategorias(c.categorias);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (acceso.estado === "listo") cargar();
  }, [acceso.estado, cargar]);

  // El stock cambia al cobrar o cancelar pedidos y al ajustarlo a mano.
  useRefrescarEnVivo(cargar, ["stock_", "pedido_", "pago_"]);
  
  const nombreCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])),
    [categorias],
  );

  const visibles = useMemo(() => {
    if (!productos) return [];
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (filtro === "activos" && !p.activo) return false;
      if (filtro === "desactivados" && p.activo) return false;
      if (filtro === "stock" && !(p.activo && p.stock <= STOCK_BAJO)) return false;
      return !texto || p.nombre.toLowerCase().includes(texto);
    });
  }, [productos, busqueda, filtro]);

  const cambiarEstado = async (producto) => {
    const accion = producto.activo ? "desactivar" : "activar";
    const aviso = producto.activo
      ? `¿Desactivar "${producto.nombre}"? Dejará de verse en la tienda, pero los pedidos que ya lo tienen no cambian.`
      : `¿Activar "${producto.nombre}"? Volverá a verse en la tienda.`;
    if (!window.confirm(aviso)) return;

    try {
      await graphqlAuthRequest(CAMBIAR_ESTADO, {
        id: producto.id,
        activo: !producto.activo,
      });
      setMensaje(`"${producto.nombre}" se ${accion === "desactivar" ? "desactivó" : "activó"}.`);
      cargar();
    } catch (err) {
      setMensaje(`No se pudo ${accion}: ${err.message}`);
    }
  };

  const alGuardar = (producto, esNuevo) => {
    setEditando(null);
    setMensaje(`"${producto.nombre}" se ${esNuevo ? "agregó" : "actualizó"} correctamente.`);
    cargar();
  };

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  const conteo = (f) =>
    productos
      ? productos.filter((p) =>
        f === "activos" ? p.activo
          : f === "desactivados" ? !p.activo
            : f === "stock" ? p.activo && p.stock <= STOCK_BAJO
              : true,
      ).length
      : 0;

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Catálogo de la tienda</p>
          <h1>Productos</h1>
        </div>
        <button className="admin-boton" onClick={() => setEditando({})}>
          + Nuevo producto
        </button>
      </header>

      {mensaje && (
        <div className="admin-aviso-linea exito" role="status">
          {mensaje}
          <button className="admin-cerrar" onClick={() => setMensaje(null)} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {error && <div className="admin-aviso-linea">No se pudieron cargar los productos: {error}</div>}

      <div className="admin-filtros">
        <input
          type="search"
          className="admin-input"
          placeholder="Buscar por nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar producto"
        />
        <div className="admin-segmentos" role="group" aria-label="Filtrar productos">
          {[
            ["todos", "Todos"],
            ["activos", "Activos"],
            ["desactivados", "Desactivados"],
            ["stock", "Stock bajo"],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              className={filtro === valor ? "activo" : ""}
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
            >
              {texto} <span>{conteo(valor)}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="admin-tarjeta">
        {!productos ? (
          !error && <p className="admin-cargando">Cargando productos…</p>
        ) : visibles.length === 0 ? (
          <p className="admin-vacio">No hay productos que coincidan.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="admin-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="num">Precio</th>
                  <th className="num">Stock</th>
                  <th>Estado</th>
                  <th><span className="solo-lector">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} className={p.activo ? "" : "fila-inactiva"}>
                    <td>
                      <div className="producto-celda">
                        <Miniatura url={p.imagenUrl} nombre={p.nombre} />
                        <div>
                          {p.nombre}
                          <small>{p.descripcion}</small>
                        </div>
                      </div>
                    </td>
                    <td>{nombreCategoria[p.categoriaId] ?? "—"}</td>
                    <td className="num">{dinero(p.precio)}</td>
                    <td className="num">
                      <Stock cantidad={p.stock} activo={p.activo} />
                    </td>
                    <td>
                      {p.activo ? (
                        <span className="badge badge-bien">
                          <span aria-hidden="true">●</span>Activo
                        </span>
                      ) : (
                        <span className="badge badge-neutro">
                          <span aria-hidden="true">○</span>Desactivado
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="acciones">
                        <button className="admin-enlace" onClick={() => setEditando(p)}>
                          Editar
                        </button>
                        <button
                          className={`admin-enlace ${p.activo ? "peligro" : ""}`}
                          onClick={() => cambiarEstado(p)}
                        >
                          {p.activo ? "Desactivar" : "Activar"}
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

      {editando && (
        <FormularioProducto
          producto={editando}
          categorias={categorias}
          onCancelar={() => setEditando(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}

/** Foto del producto; si la URL no carga, muestra la inicial. */
function Miniatura({ url, nombre }) {
  const [rota, setRota] = useState(false);

  useEffect(() => setRota(false), [url]);

  if (rota) {
    return (
      <span className="sin-imagen" aria-hidden="true">
        {nombre.charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" onError={() => setRota(true)} />;
}

function Stock({ cantidad, activo }) {
  if (activo && cantidad === 0) {
    return (
      <span className="badge badge-critico">
        <span aria-hidden="true">✕</span>Agotado
      </span>
    );
  }
  if (activo && cantidad <= STOCK_BAJO) {
    return (
      <span className="badge badge-aviso">
        <span aria-hidden="true">!</span>
        {cantidad}
      </span>
    );
  }
  return cantidad;
}
