import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";
import { rutaLocalizada, traducir } from "../../i18n/utils";
import "../../styles/authStatus.css";

export default function AuthStatus({ idioma = "es" }) {
  const [usuario, setUsuario] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);

  const t = (es, en) => traducir(idioma, es, en);

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

    // Verificar si el usuario es administrador.
    // Los permisos también se validan en el backend.
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

    window.location.href = rutaLocalizada("/", idioma);
  };

  if (!usuario) {
    return (
      <a href={rutaLocalizada("/login", idioma)} className="auth-login">
        {t("Iniciar sesión", "Sign in")}
      </a>
    );
  }

  return (
    <div className="auth-status">
      <span className="auth-user">
        {t("Hola", "Hello")}, {usuario.nombre}
      </span>

      <a href={rutaLocalizada("/mis-pedidos", idioma)} className="auth-login">
        {t("Mis pedidos", "My orders")}
      </a>

      {esAdmin && (
        <a href="/admin" className="auth-panel">
          {t("Panel", "Dashboard")}
        </a>
      )}

      <button type="button" className="auth-logout" onClick={cerrarSesion}>
        {t("Cerrar sesión", "Sign out")}
      </button>
    </div>
  );
}
