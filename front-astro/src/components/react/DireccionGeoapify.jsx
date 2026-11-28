import { useEffect, useRef, useState } from "react";
import { traducir } from "../../i18n/utils";

const API_KEY = import.meta.env.PUBLIC_GEOAPIFY_API_KEY;

export default function DireccionGeoapify({ value, onChange, idioma = "es" }) {
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);

  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [error, setError] = useState("");

  const contenedorRef = useRef(null);
  const solicitudRef = useRef(0);
  const seleccionRef = useRef(false);

  const t = (es, en) => traducir(idioma, es, en);

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
    const textoTraducido = (es, en) => traducir(idioma, es, en);

    if (!mostrarSugerencias || seleccionRef.current) {
      return;
    }

    const texto = value.trim();

    if (texto.length < 4) {
      setSugerencias([]);
      setBuscando(false);
      setError("");
      return;
    }

    if (!API_KEY) {
      setError(
        textoTraducido(
          "Autocompletado no disponible. Escribe tu dirección manualmente.",
          "Autocomplete is unavailable. Enter your address manually.",
        ),
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
          lang: idioma,
          limit: "5",
          format: "json",
          apiKey: API_KEY,
        });

        const respuesta = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?${parametros}`,
          {
            signal: controlador.signal,
          },
        );

        if (!respuesta.ok) {
          throw new Error("No se pudieron consultar las direcciones.");
        }

        const datos = await respuesta.json();

        if (solicitudActual !== solicitudRef.current) {
          return;
        }

        setSugerencias(datos.results || []);
      } catch (err) {
        if (
          err.name === "AbortError" ||
          solicitudActual !== solicitudRef.current
        ) {
          return;
        }

        setSugerencias([]);

        setError(
          textoTraducido(
            "No se encontraron sugerencias. Puedes escribir tu dirección.",
            "No suggestions were found. You can enter your address manually.",
          ),
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
  }, [value, mostrarSugerencias, idioma]);

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
    setBuscando(false);
    setError("");
  };

  return (
    <div className="geoapify-direccion" ref={contenedorRef}>
      <label htmlFor="direccion-envio">
        {t("Dirección de envío", "Shipping address")}
      </label>

      <textarea
        id="direccion-envio"
        value={value}
        onChange={cambiarDireccion}
        onFocus={() => {
          if (!seleccionRef.current) {
            setMostrarSugerencias(true);
          }
        }}
        placeholder={t(
          "Escribe tu calle, número, colonia y ciudad",
          "Enter your street, number, neighborhood and city",
        )}
        autoComplete="street-address"
        required
        rows={3}
      />

      {mostrarSugerencias && (
        <>
          {buscando && (
            <p className="geoapify-estado" role="status">
              {t("Buscando direcciones...", "Searching for addresses...")}
            </p>
          )}

          {sugerencias.length > 0 && (
            <ul className="geoapify-sugerencias">
              {sugerencias.map((opcion, indice) => (
                <li key={opcion.place_id || indice}>
                  <button
                    type="button"
                    className="geoapify-opcion"
                    onClick={() => seleccionarDireccion(opcion)}
                  >
                    <span className="geoapify-opcion-icono" aria-hidden="true">
                      ⌖
                    </span>

                    <span className="geoapify-opcion-contenido">
                      <strong>
                        {[opcion.street, opcion.housenumber]
                          .filter(Boolean)
                          .join(" ") ||
                          opcion.address_line1 ||
                          opcion.formatted}
                      </strong>

                      <span className="geoapify-opcion-ubicacion">
                        {[
                          opcion.suburb,
                          opcion.city || opcion.county,
                          opcion.state,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>

                      <small>
                        {opcion.postcode
                          ? t(
                              `C.P. ${opcion.postcode} · México`,
                              `ZIP ${opcion.postcode} · Mexico`,
                            )
                          : t("México", "Mexico")}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="geoapify-estado" role="status">
              {error}
            </p>
          )}
        </>
      )}

      <p className="geoapify-ayuda">
        {t(
          "Selecciona una sugerencia o escribe tu dirección completa manualmente.",
          "Select a suggestion or enter your full address manually.",
        )}
      </p>
    </div>
  );
}
