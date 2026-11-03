import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const GRAPHQL_URL =
  import.meta.env.PUBLIC_GRAPHQL_URL || "http://127.0.0.1:8000/graphql";
const API_URL = GRAPHQL_URL.replace(/\/graphql\/?$/, "");

function RespuestaMarkdown({ contenido }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children }) => {
          if (!href) return <span>{children}</span>;

          let destino;

          try {
            const url = new URL(href, window.location.origin);

            // Solo permitir enlaces internos a productos de ALMĀS.
            if (
              url.origin === window.location.origin &&
              /^\/producto\/\d+\/?$/.test(url.pathname)
            ) {
              destino = url.pathname;
            }
          } catch {
            return <span>{children}</span>;
          }

          if (!destino) return <span>{children}</span>;

          return (
            <a href={destino} className="almas-chat-enlace">
              {children}
            </a>
          );
        },
      }}
    >
      {contenido}
    </ReactMarkdown>
  );
}

export default function AsistenteIA() {
  const MENSAJE_INICIAL = {
    role: "assistant",
    content:
      "¡Hola! Soy el asistente de ALMĀS. 💎 ¿Buscas una joya para ti o para regalar?",
  };

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([MENSAJE_INICIAL]);
  const [restaurado, setRestaurado] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);

  const finalRef = useRef(null);
  const enviandoRef = useRef(false);

  useEffect(() => {
    try {
      const guardados = sessionStorage.getItem("almas_chat_mensajes");
      const estadoAbierto = sessionStorage.getItem("almas_chat_abierto");

      if (guardados) {
        const datos = JSON.parse(guardados);

        if (
          Array.isArray(datos) &&
          datos.every(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string",
          )
        ) {
          setMensajes(datos.slice(-50));
        }
      }

      setAbierto(estadoAbierto === "true");
    } catch (error) {
      console.error("No se pudo recuperar el chat:", error);
    } finally {
      setRestaurado(true);
    }
  }, []);

  useEffect(() => {
    if (!restaurado) return;

    try {
      sessionStorage.setItem(
        "almas_chat_mensajes",
        JSON.stringify(mensajes.slice(-50)),
      );
      sessionStorage.setItem("almas_chat_abierto", String(abierto));
    } catch (error) {
      console.error("No se pudo guardar el chat:", error);
    }
  }, [mensajes, abierto, restaurado]);

  useEffect(() => {
    if (abierto) {
      finalRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [mensajes, abierto, cargando]);

  async function enviarMensaje(e) {
    e.preventDefault();

    const mensaje = texto.trim();

    if (!mensaje || enviandoRef.current || mensaje.length > 2000) return;

    enviandoRef.current = true;
    setCargando(true);
    setTexto("");

    const historial = mensajes
      .filter((m) => !m.error)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));

    setMensajes((actuales) => [
      ...actuales,
      { role: "user", content: mensaje },
    ]);

    try {
      const respuesta = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje,
          historial,
        }),
      });

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`);
      }

      const datos = await respuesta.json();

      if (typeof datos.respuesta !== "string") {
        throw new Error("Respuesta inválida");
      }

      setMensajes((actuales) => [
        ...actuales,
        { role: "assistant", content: datos.respuesta },
      ]);
    } catch (error) {
      console.error("Error del asistente:", error);

      setMensajes((actuales) => [
        ...actuales,
        {
          role: "assistant",
          content:
            "Lo siento, no pude responder en este momento. Inténtalo nuevamente.",
          error: true,
        },
      ]);
    } finally {
      enviandoRef.current = false;
      setCargando(false);
    }
  }

  if (!restaurado) return null;
  return (
    <div className="almas-chat">
      {abierto && (
        <section
          className="almas-chat-ventana"
          aria-label="Asistente de compras ALMĀS"
        >
          <header className="almas-chat-header">
            <div className="almas-chat-identidad">
              <span className="almas-chat-logo">✦</span>
              <div>
                <strong>ALMĀS</strong>
                <small>Asistente de compras</small>
              </div>
            </div>

            <button
              type="button"
              className="almas-chat-minimizar"
              onClick={() => setAbierto(false)}
              aria-label="Minimizar asistente"
            >
              −
            </button>
          </header>

          <div className="almas-chat-mensajes" aria-live="polite">
            {mensajes.map((mensaje, index) => (
              <div
                key={index}
                className={`almas-chat-mensaje ${
                  mensaje.role === "user" ? "usuario" : "asistente"
                }`}
              >
                {mensaje.role === "assistant" ? (
                  <RespuestaMarkdown contenido={mensaje.content} />
                ) : (
                  mensaje.content
                )}
              </div>
            ))}

            {cargando && (
              <div className="almas-chat-mensaje asistente">Escribiendo...</div>
            )}

            <div ref={finalRef} />
          </div>

          <form className="almas-chat-formulario" onSubmit={enviarMensaje}>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregúntame sobre nuestras joyas..."
              aria-label="Mensaje para el asistente"
              maxLength={2000}
              disabled={cargando}
            />

            <button
              type="submit"
              disabled={cargando || !texto.trim()}
              aria-label="Enviar mensaje"
            >
              ➤
            </button>
          </form>

          <div className="almas-chat-pie">Asistente virtual de ALMĀS</div>
        </section>
      )}

      <button
        type="button"
        className="almas-chat-boton"
        onClick={() => setAbierto((actual) => !actual)}
        aria-label={abierto ? "Cerrar asistente" : "Abrir asistente"}
        aria-expanded={abierto}
      >
        <span>{abierto ? "×" : "✦"}</span>
        {!abierto && <span>¿Necesitas ayuda?</span>}
      </button>

      <style>{`
  /* Contenedor principal */

  .almas-chat {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 9999;
    font-family: inherit;
  }

  /* Boton flotante */

  .almas-chat-boton {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border: 1px solid #d4af37;
    border-radius: 40px;
    background: #870d67;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 5px 22px #0003;
    transition: transform 0.2s, background 0.2s;
  }

  .almas-chat-boton:hover {
    transform: translateY(-2px);
    background: #a4147e;
  }

  .almas-chat-boton span:first-child {
    font-size: 22px;
    line-height: 1;
  }

  /* Ventana desplegable */

  .almas-chat-ventana {
    position: absolute;
    right: 0;
    bottom: 68px;
    width: 370px;
    height: 490px;
    max-height: calc(100dvh - 110px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #e8d7a5;
    border-radius: 16px;
    background: #fff;
    color: #24201e;
    box-shadow: 0 10px 45px #0003;
  }

  /* Encabezado */

  .almas-chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 17px 20px;
    background: #870d67;
    color: #fff;
    border-bottom: 2px solid #d4af37;
  }

  .almas-chat-identidad {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .almas-chat-logo {
    display: grid;
    place-items: center;
    width: 39px;
    height: 39px;
    border: 1px solid #d4af37;
    border-radius: 50%;
    color: #d4af37;
    font-size: 22px;
  }

  .almas-chat-identidad strong {
    display: block;
    font-size: 16px;
    letter-spacing: 2px;
  }

  .almas-chat-identidad small {
    display: block;
    margin-top: 3px;
    color: #f0d9e9;
    font-size: 11px;
  }

  .almas-chat-minimizar {
    border: none;
    background: transparent;
    color: #fff;
    font-size: 28px;
    cursor: pointer;
    transition: color 0.2s;
  }

  .almas-chat-minimizar:hover {
    color: #d4af37;
  }

  /* Area de mensajes */

  .almas-chat-mensajes {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    overflow-y: auto;
    background: #faf8f6;
  }

  .almas-chat-mensaje {
    max-width: 88%;
    padding: 12px 14px;
    border-radius: 13px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* Mensajes del asistente */

  .almas-chat-mensaje.asistente {
    align-self: flex-start;
    background: #fff;
    color: #24201e;
    border: 1px solid #e9e4df;
    border-bottom-left-radius: 4px;
  }

  /* Mensajes del usuario */

  .almas-chat-mensaje.usuario {
    align-self: flex-end;
    background: #870d67;
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  /* Formulario */

  .almas-chat-formulario {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid #eee;
    background: #fff;
  }

  .almas-chat-formulario input {
    flex: 1;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid #e5dfda;
    border-radius: 9px;
    outline: none;
    background: #fff;
    color: #24201e;
    font-size: 12px;
    transition: border-color 0.2s;
  }

  .almas-chat-formulario input:focus {
    border-color: #d4af37;
  }

  .almas-chat-formulario input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .almas-chat-formulario button {
    width: 39px;
    height: 39px;
    flex-shrink: 0;
    border: none;
    border-radius: 9px;
    background: #870d67;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .almas-chat-formulario button:hover:not(:disabled) {
    background: #a4147e;
  }

  .almas-chat-formulario button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Pie del chat */

  .almas-chat-pie {
    padding: 0 12px 10px;
    text-align: center;
    font-size: 10px;
    color: #999;
    background: #fff;
  }

  /* Markdown */

  .almas-chat-mensaje p {
    margin: 0 0 10px;
  }

  .almas-chat-mensaje p:last-child {
    margin-bottom: 0;
  }

  .almas-chat-mensaje ul,
  .almas-chat-mensaje ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  .almas-chat-mensaje li {
    margin-bottom: 6px;
  }

  .almas-chat-mensaje strong {
    font-weight: 700;
  }

  /* Enlaces a productos */

  .almas-chat-mensaje .almas-chat-enlace {
    color: #870d67;
    text-decoration: underline;
    font-weight: 600;
    transition: color 0.2s;
  }

  .almas-chat-mensaje .almas-chat-enlace:hover {
    color: #b38b20;
  }

  /* Tablas Markdown */

  .almas-chat-mensaje table {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 11px;
  }

  .almas-chat-mensaje th,
  .almas-chat-mensaje td {
    padding: 7px;
    border: 1px solid #e5dfda;
    text-align: left;
  }

  .almas-chat-mensaje th {
    background: #f5eff3;
    color: #870d67;
  }

  .almas-chat-mensaje code {
    overflow-wrap: anywhere;
  }

  /* Adaptacion a celulares */

  @media (max-width: 480px) {
    .almas-chat {
      right: 12px;
      bottom: 12px;
    }

    .almas-chat-ventana {
      width: calc(100vw - 24px);
      height: min(540px, calc(100dvh - 100px));
    }

    .almas-chat-boton {
      padding: 13px 16px;
    }
  }
`}</style>
    </div>
  );
}
