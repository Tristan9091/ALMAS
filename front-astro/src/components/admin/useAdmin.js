import { useEffect, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";

const ME_QUERY = `
  query {
    me {
      id
      nombre
      email
      rol
    }
  }
`;

/**
 * Revisa que quien abre el panel sea administrador.
 *
 * Esto es solo para la experiencia de uso (no mostrar el panel a quien
 * no corresponde). La seguridad real está en el backend: cada consulta
 * del panel vuelve a revisar el rol con requerir_admin().
 *
 * Regresa { estado, usuario, mensaje } donde estado es:
 *   "cargando" | "listo" | "sin-permiso" | "error"
 */
export function useAdmin() {
  const [acceso, setAcceso] = useState({ estado: "cargando" });

  useEffect(() => {
    if (!localStorage.getItem("almas-token")) {
      window.location.href = "/login";
      return;
    }

    graphqlAuthRequest(ME_QUERY)
      .then((data) => {
        if (data.me.rol === "admin") {
          setAcceso({ estado: "listo", usuario: data.me });
        } else {
          setAcceso({ estado: "sin-permiso", usuario: data.me });
        }
      })
      .catch((error) => {
        // Sesión vencida o inválida: hay que iniciar sesión de nuevo.
        if (/token|autenticado|no encontrado/i.test(error.message)) {
          localStorage.removeItem("almas-token");
          localStorage.removeItem("almas-user");
          window.location.href = "/login";
          return;
        }
        setAcceso({ estado: "error", mensaje: error.message });
      });
  }, []);

  return acceso;
}
