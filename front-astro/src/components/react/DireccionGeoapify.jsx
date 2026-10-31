import { useEffect, useRef, useState } from "react";

const API_KEY = import.meta.env.PUBLIC_GEOAPIFY_API_KEY;

export default function DireccionGeoapify({ value, onChange }) {
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [error, setError] = useState("");

  const contenedorRef = useRef(null);
  const solicitudRef = useRef(0);
  const seleccionRef = useRef(false);

  useEffect(() => {
    const cerrar = (event) => {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(event.target)
      ) {
        setMostrarSugerencias(false);
      }
    };

    document.addEventListener("pointerdown", cerrar);

    return () => {
      document.removeEventListener("pointerdown", cerrar);
    };
  }, []);

  useEffect(() => {
    if (!mostrarSugerencias || seleccionRef.current) return;

    const texto = value.trim();

    if (texto.length < 4) {
      setSugerencias([]);
      setBuscando(false);
      setError("");
      return;
    }

    if (!API_KEY) {
      setError(
        "Autocompletado no disponible. Escribe tu direccion manualmente.",
      );
      setBuscando(false);
      return;
    }

    const controlador = new AbortController();
    const solicitudActual = ++solicitudRef.current;

    const temporizador = setTimeout(async () => {
      setBuscando(true);
      setError("");

      try {
        const parametros = new URLSearchParams({
          text: texto,
          filter: "countrycode:mx",
          lang: "es",
          limit: "5",
          format: "json",
          apiKey: API_KEY,
        });

        const respuesta = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?${parametros}`,
          { signal: controlador.signal },
        );

        if (!respuesta.ok) {
          throw new Error("No se pudieron consultar las direcciones.");
        }

        const datos = await respuesta.json();

        if (solicitudActual !== solicitudRef.current) return;

        setSugerencias(datos.results || []);
      } catch (err) {
        if (err.name === "AbortError") return;

        setSugerencias([]);
        setError(
          "No se encontraron sugerencias. Puedes escribir tu direccion.",
        );
      } finally {
        if (solicitudActual === solicitudRef.current) {
          setBuscando(false);
        }
      }
    }, 450);

    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [value, mostrarSugerencias]);

  const cambiarDireccion = (event) => {
    seleccionRef.current = false;
    onChange(event.target.value);
    setMostrarSugerencias(true);
    setSugerencias([]);
  };

  const seleccionarDireccion = (opcion) => {
    seleccionRef.current = true;
    solicitudRef.current += 1;

    onChange(opcion.formatted || "");
    setSugerencias([]);
    setMostrarSugerencias(false);
    setError("");
  };

  return (
    <div className="geoapify-direccion" ref={contenedorRef}>
      <label htmlFor="direccion-envio">Direccion de envio</label>

      <textarea
        id="direccion-envio"
        value={value}
        onChange={cambiarDireccion}
        onFocus={() => {
          if (!seleccionRef.current) {
            setMostrarSugerencias(true);
          }
        }}
        placeholder="Escribe tu calle, numero, colonia y ciudad"
        autoComplete="street-address"
        required
        rows={3}
      />

      {mostrarSugerencias && (
        <>
          {buscando && (
            <p className="geoapify-estado">Buscando direcciones...</p>
          )}

          {sugerencias.length > 0 && (
            <ul className="geoapify-sugerencias">
              {sugerencias.map((opcion, indice) => (
                <li key={opcion.place_id || indice}>
                  <button
                    type="button"
                    onClick={() => seleccionarDireccion(opcion)}
                  >
                    {opcion.formatted}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="geoapify-estado">{error}</p>}
        </>
      )}

      <p className="geoapify-ayuda">
        Selecciona una sugerencia o escribe tu direccion completa manualmente.
      </p>
    </div>
  );
}
