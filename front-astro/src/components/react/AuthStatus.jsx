import { useEffect, useState } from "react";
import "../../styles/authStatus.css";

export default function AuthStatus() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem("almas-user");

    if (usuarioGuardado) {
      try {
        setUsuario(JSON.parse(usuarioGuardado));
      } catch {
        localStorage.removeItem("almas-user");
      }
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

      <button className="auth-logout" onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </div>
  );
}
