import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { useAdmin } from "./useAdmin";
import EstadoAcceso from "./EstadoAcceso";
import { dinero, fechaHora } from "./formato";

// Nunca se pide la contraseña ni su hash: el backend tampoco los expone.
const CLIENTES_QUERY = `
  query {
    clientesAdmin {
      id
      nombre
      email
      rol
      activo
      numPedidos
      totalComprado
      ultimoPedido
    }
  }
`;

const CAMBIAR_ESTADO = `
  mutation CambiarEstadoCliente($id: Int!, $activo: Boolean!) {
    cambiarEstadoCliente(id: $id, activo: $activo) { id activo }
  }
`;

export default function ClientesAdmin() {
  const acceso = useAdmin();
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await graphqlAuthRequest(CLIENTES_QUERY);
      setClientes(data.clientesAdmin);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (acceso.estado === "listo") cargar();
  }, [acceso.estado, cargar]);

  const visibles = useMemo(() => {
    if (!clientes) return [];
    const texto = busqueda.trim().toLowerCase();
    return clientes.filter(
      (c) =>
        !texto || c.nombre.toLowerCase().includes(texto) || c.email.toLowerCase().includes(texto),
    );
  }, [clientes, busqueda]);

  const cambiarEstado = async (cliente) => {
    const aviso = cliente.activo
      ? `¿Desactivar la cuenta de ${cliente.nombre}? No podrá iniciar sesión ni comprar. Sus pedidos se conservan.`
      : `¿Reactivar la cuenta de ${cliente.nombre}?`;
    if (!window.confirm(aviso)) return;

    try {
      await graphqlAuthRequest(CAMBIAR_ESTADO, { id: cliente.id, activo: !cliente.activo });
      setMensaje({
        tipo: "exito",
        texto: `La cuenta de ${cliente.nombre} se ${cliente.activo ? "desactivó" : "reactivó"}.`,
      });
      cargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message });
    }
  };

  if (acceso.estado !== "listo") {
    return <EstadoAcceso acceso={acceso} />;
  }

  return (
    <div className="admin-pagina">
      <header className="admin-encabezado">
        <div>
          <p className="admin-saludo">Cuentas registradas</p>
          <h1>Clientes</h1>
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

      {error && <div className="admin-aviso-linea">No se pudieron cargar los clientes: {error}</div>}

      <div className="admin-filtros">
        <input
          type="search"
          className="admin-input"
          placeholder="Buscar por nombre o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar cliente"
        />
      </div>

      <section className="admin-tarjeta">
        {!clientes ? (
          !error && <p className="admin-cargando">Cargando clientes…</p>
        ) : visibles.length === 0 ? (
          <p className="admin-vacio">No hay cuentas que coincidan.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="admin-tabla">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Tipo</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Compras pagadas</th>
                  <th>Último pedido</th>
                  <th>Estado</th>
                  <th><span className="solo-lector">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id} className={c.activo ? "" : "fila-inactiva"}>
                    <td>
                      {c.nombre}
                      <small>{c.email}</small>
                    </td>
                    <td>
                      {c.rol === "admin" ? (
                        <span className="badge badge-info">
                          <span aria-hidden="true">★</span>Admin
                        </span>
                      ) : (
                        "Cliente"
                      )}
                    </td>
                    <td className="num">{c.numPedidos}</td>
                    <td className="num">{dinero(c.totalComprado)}</td>
                    <td className="tabla-fecha">{c.ultimoPedido ? fechaHora(c.ultimoPedido) : "—"}</td>
                    <td>
                      {c.activo ? (
                        <span className="badge badge-bien">
                          <span aria-hidden="true">●</span>Activa
                        </span>
                      ) : (
                        <span className="badge badge-neutro">
                          <span aria-hidden="true">○</span>Desactivada
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="acciones">
                        {c.rol === "cliente" && (
                          <button
                            className={`admin-enlace ${c.activo ? "peligro" : ""}`}
                            onClick={() => cambiarEstado(c)}
                          >
                            {c.activo ? "Desactivar" : "Reactivar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
