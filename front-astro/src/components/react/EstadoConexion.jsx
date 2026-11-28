import { useEffect, useState } from "react";
import { traducir } from "../../i18n/utils";

export default function EstadoConexion({ idioma = "es" }) {
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    const actualizarEstado = () => {
      setSinConexion(!navigator.onLine);
    };

    actualizarEstado();

    window.addEventListener("online", actualizarEstado);
    window.addEventListener("offline", actualizarEstado);

    return () => {
      window.removeEventListener("online", actualizarEstado);
      window.removeEventListener("offline", actualizarEstado);
    };
  }, []);

  if (!sinConexion) return null;

  return (
    <div
      role="status"
      style={{
        width: "100%",
        backgroundColor: "#fff3cd",
        color: "#664d03",
        padding: "12px var(--page-padding)",
        textAlign: "center",
        fontSize: "14px",
        lineHeight: "1.5",
        borderBottom: "1px solid #e6d49a",
        overflowWrap: "anywhere",
      }}
    >
      {traducir(
        idioma,
        "Estás sin conexión. Puedes consultar el catálogo guardado, pero los precios y la disponibilidad podrían no estar actualizados.",
        "You are offline. You can browse the saved catalog, but prices and availability may not be up to date.",
      )}
    </div>
  );
}
