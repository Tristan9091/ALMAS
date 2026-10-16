import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import "../../styles/authStatus.css";

export default function AuthStatus() {
  const [usuario, setUsuario] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem("almas-user");
    const token = localStorage.getItem("almas-token");

    if (usuarioGuardado && token) {
      try {
        setUsuario(JSON.parse(usuarioGuardado));
      } catch {
        localStorage.removeItem("almas-user");
      }
    }

    // El enlace al panel solo aparece para administradores.
    // Los permisos reales también se validan en el backend.
    if (token) {
      graphqlAuthRequest(`query { me { rol } }`)
        .then((data) => setEsAdmin(data.me?.rol === "admin"))
        .catch(() => setEsAdmin(false));
    }
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem("almas-token");
    localStorage.removeItem("almas-user");
    setUsuario(null);
    setEsAdmin(false);
    window.location.href = "/";
  };

  if (!usuario) {
    return (
      <a href="/login" className="auth-login">
        Iniciar sesión
      </a>
    );
  }

  return (
    <div className="auth-status">
      <span className="auth-user">Hola, {usuario.nombre}</span>

      <a href="/mis-pedidos" className="auth-login">
        Mis pedidos
      </a>

      {esAdmin && (
        <a href="/admin" className="auth-panel">
          Panel
        </a>
      )}

      <button className="auth-logout" onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </div>
  );
}
