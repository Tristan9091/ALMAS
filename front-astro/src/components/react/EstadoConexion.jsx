import { useEffect, useState } from "react";

export default function EstadoConexion() {
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
        backgroundColor: "#fff3cd",
        color: "#664d03",
        padding: "12px 16px",
        textAlign: "center",
        fontSize: "14px",
        borderBottom: "1px solid #e6d49a",
      }}
    >
      Estás sin conexión. Puedes consultar el catálogo guardado, pero los
      precios y la disponibilidad podrían no estar actualizados.
    </div>
  );
}
