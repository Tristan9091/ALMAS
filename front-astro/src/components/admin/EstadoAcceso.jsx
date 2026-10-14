/**
 * Pantallas de "cargando", "sin permiso" y "error" del panel.
 * Cada página del panel la muestra mientras useAdmin() no esté "listo".
 */
export default function EstadoAcceso({ acceso }) {
  if (acceso.estado === "cargando") {
    return <p className="admin-cargando">Verificando acceso…</p>;
  }

  if (acceso.estado === "sin-permiso") {
    return (
      <div className="admin-aviso">
        <h1>Acceso restringido</h1>
        <p>
          Esta sección es solo para administradores de ALMĀS. Tu cuenta (
          {acceso.usuario?.email}) es de cliente.
        </p>
        <a className="admin-boton" href="/">
          Volver a la tienda
        </a>
      </div>
    );
  }

  return (
    <div className="admin-aviso">
      <h1>No se pudo cargar el panel</h1>
      <p>{acceso.mensaje}</p>
      <button className="admin-boton" onClick={() => window.location.reload()}>
        Reintentar
      </button>
    </div>
  );
}
