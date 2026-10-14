import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import "../../styles/authStatus.css";

export default function AuthStatus() {
  const [usuario, setUsuario] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem("almas-user");

    if (usuarioGuardado) {
      try {
        setUsuario(JSON.parse(usuarioGuardado));
      } catch {
        localStorage.removeItem("almas-user");
      }
    }

    // Solo para mostrar el enlace al panel. Si la consulta falla
    // (sesión vencida, backend sin roles), simplemente no se muestra.
    if (localStorage.getItem("almas-token")) {
      graphqlAuthRequest(`query { me { rol } }`)
        .then((data) => setEsAdmin(data.me.rol === "admin"))
        .catch(() => setEsAdmin(false));
    }
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem("almas-token");
    localStorage.removeItem("almas-user");

    setUsuario(null);

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
