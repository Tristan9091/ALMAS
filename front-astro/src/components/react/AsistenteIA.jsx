import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { traducir, rutaLocalizada } from "../../i18n/utils";

const GRAPHQL_URL =
  import.meta.env.PUBLIC_GRAPHQL_URL || "http://127.0.0.1:8000/graphql";

const API_URL = GRAPHQL_URL.replace(/\/graphql\/?$/, "");

function RespuestaMarkdown({ contenido, idioma }) {
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

            if (
              url.origin === window.location.origin &&
              /^(\/en)?\/producto\/\d+\/?$/.test(url.pathname)
            ) {
              destino = rutaLocalizada(url.pathname, idioma);
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

export default function AsistenteIA({ idioma = "es" }) {
  const t = (es, en) => traducir(idioma, es, en);

  const MENSAJE_INICIAL = {
    role: "assistant",
    content: t(
      "¡Hola! Soy el asistente de ALMĀS. 💎 ¿Buscas una joya para ti o para regalar?",
      "Hello! I'm the ALMĀS assistant. 💎 Are you looking for jewelry for yourself or as a gift?",
    ),
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
          datos.length > 0 &&
          datos.every(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string",
          )
        ) {
          const historial = datos.slice(-50);

          const saludos = [
            "¡Hola! Soy el asistente de ALMĀS. 💎 ¿Buscas una joya para ti o para regalar?",
            "Hello! I'm the ALMĀS assistant. 💎 Are you looking for jewelry for yourself or as a gift?",
          ];

          if (
            historial[0]?.role === "assistant" &&
            saludos.includes(historial[0].content)
          ) {
            historial[0] = MENSAJE_INICIAL;
          }

          setMensajes(historial);
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
      finalRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [mensajes, abierto, cargando]);

  async function enviarMensaje(e) {
    e.preventDefault();

    const mensaje = texto.trim();

    if (!mensaje || enviandoRef.current || mensaje.length > 2000) {
      return;
    }

    enviandoRef.current = true;

    setCargando(true);
    setTexto("");

    const historial = mensajes
      .filter((m) => !m.error)
      .slice(-10)
      .map(({ role, content }) => ({
        role,
        content: content.slice(0, 2000),
      }));

    setMensajes((actuales) => [
      ...actuales,
      {
        role: "user",
        content: mensaje,
      },
    ]);

    try {
      const respuesta = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          mensaje,
          historial,
          idioma,
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
        {
          role: "assistant",
          content: datos.respuesta,
        },
      ]);
    } catch (error) {
      console.error("Error del asistente:", error);

      setMensajes((actuales) => [
        ...actuales,
        {
          role: "assistant",

          content: t(
            "Lo siento, no pude responder en este momento. Inténtalo nuevamente.",
            "Sorry, I couldn't respond right now. Please try again.",
          ),

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
          id="almas-chat-ventana"
          className="almas-chat-ventana"
          aria-label={t(
            "Asistente de compras ALMĀS",
            "ALMĀS shopping assistant",
          )}
        >
          <header className="almas-chat-header">
            <div className="almas-chat-identidad">
              <span className="almas-chat-logo" aria-hidden="true">
                ✦
              </span>

              <div>
                <strong>ALMĀS</strong>

                <small>{t("Asistente de compras", "Shopping assistant")}</small>
              </div>
            </div>

            <button
              type="button"
              className="almas-chat-minimizar"
              onClick={() => setAbierto(false)}
              aria-label={t("Minimizar asistente", "Minimize assistant")}
            >
              −
            </button>
          </header>

          <div className="almas-chat-mensajes" role="log" aria-live="polite">
            {mensajes.map((mensaje, index) => (
              <div
                key={index}
                className={`almas-chat-mensaje ${
                  mensaje.role === "user" ? "usuario" : "asistente"
                }`}
              >
                {mensaje.role === "assistant" ? (
                  <RespuestaMarkdown
                    contenido={mensaje.content}
                    idioma={idioma}
                  />
                ) : (
                  mensaje.content
                )}
              </div>
            ))}

            {cargando && (
              <div className="almas-chat-mensaje asistente">
                {t("Escribiendo...", "Typing...")}
              </div>
            )}

            <div ref={finalRef} />
          </div>

          <form className="almas-chat-formulario" onSubmit={enviarMensaje}>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t(
                "Pregúntame sobre nuestras joyas...",
                "Ask me about our jewelry...",
              )}
              aria-label={t(
                "Mensaje para el asistente",
                "Message for the assistant",
              )}
              maxLength={2000}
              disabled={cargando}
            />

            <button
              type="submit"
              disabled={cargando || !texto.trim()}
              aria-label={t("Enviar mensaje", "Send message")}
            >
              ➤
            </button>
          </form>

          <div className="almas-chat-pie">
            {t("Asistente virtual de ALMĀS", "ALMĀS virtual assistant")}
          </div>
        </section>
      )}

      <button
        type="button"
        className="almas-chat-boton"
        onClick={() => setAbierto((actual) => !actual)}
        aria-label={
          abierto
            ? t("Cerrar asistente", "Close assistant")
            : t("Abrir asistente", "Open assistant")
        }
        aria-expanded={abierto}
        aria-controls={abierto ? "almas-chat-ventana" : undefined}
      >
        <span aria-hidden="true">{abierto ? "×" : "✦"}</span>

        {!abierto && <span>{t("¿Necesitas ayuda?", "Need help?")}</span>}
      </button>

      <style>{`
        .almas-chat {
          position: fixed;

          right: max(
            12px,
            calc(env(safe-area-inset-right, 0px) + 8px)
          );

          bottom: max(
            12px,
            calc(env(safe-area-inset-bottom, 0px) + 8px)
          );

          z-index: 9999;
          font-family: inherit;
        }

        .almas-chat-boton {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          min-height: 44px;
          padding: 12px 16px;

          border: 1px solid #d4af37;
          border-radius: 40px;

          background: #870d67;
          color: #fff;

          font-size: 13px;
          font-weight: 600;

          cursor: pointer;
          box-shadow: 0 5px 22px #0003;

          transition:
            transform 0.2s,
            background 0.2s;
        }

        .almas-chat-boton:hover {
          transform: translateY(-2px);
          background: #a4147e;
        }

        .almas-chat-boton span:first-child {
          font-size: 22px;
          line-height: 1;
        }

        .almas-chat-ventana {
          position: absolute;
          right: 0;
          bottom: 60px;

          width: min(
            370px,
            calc(
              100vw - 24px -
              env(safe-area-inset-left, 0px) -
              env(safe-area-inset-right, 0px)
            )
          );

          height: 490px;

          max-height: calc(
            100dvh - 84px -
            env(safe-area-inset-top, 0px) -
            env(safe-area-inset-bottom, 0px)
          );

          display: flex;
          flex-direction: column;

          overflow: hidden;

          border: 1px solid #e8d7a5;
          border-radius: 16px;

          background: #fff;
          color: #24201e;

          box-shadow: 0 10px 45px #0003;
        }

        .almas-chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;

          padding: 12px 14px;

          background: #870d67;
          color: #fff;

          border-bottom: 2px solid #d4af37;
        }

        .almas-chat-identidad {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .almas-chat-logo {
          display: grid;
          place-items: center;

          width: 36px;
          height: 36px;
          flex-shrink: 0;

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
          min-width: 44px;
          min-height: 44px;

          border: none;
          background: transparent;
          color: #fff;

          font-size: 28px;
          cursor: pointer;
        }

        .almas-chat-mensajes {
          flex: 1;
          min-height: 0;

          display: flex;
          flex-direction: column;
          gap: 12px;

          padding: 12px;

          overflow-y: auto;
          overscroll-behavior: contain;

          background: #faf8f6;
        }

        .almas-chat-mensaje {
          max-width: 92%;

          padding: 12px 14px;
          border-radius: 13px;

          font-size: 13px;
          line-height: 1.6;

          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .almas-chat-mensaje.asistente {
          align-self: flex-start;

          background: #fff;
          color: #24201e;

          border: 1px solid #e9e4df;
          border-bottom-left-radius: 4px;
        }

        .almas-chat-mensaje.usuario {
          align-self: flex-end;

          background: #870d67;
          color: #fff;

          border-bottom-right-radius: 4px;
        }

        .almas-chat-formulario {
          display: flex;
          align-items: center;
          flex-shrink: 0;

          gap: 8px;
          padding: 10px;

          border-top: 1px solid #eee;
          background: #fff;
        }

        .almas-chat-formulario input {
          flex: 1;
          min-width: 0;
          min-height: 44px;

          padding: 10px;

          border: 1px solid #e5dfda;
          border-radius: 9px;

          background: #fff;
          color: #24201e;

          font-size: 16px;
        }

        .almas-chat-formulario input::placeholder {
          color: #777;
        }

        .almas-chat-formulario input:focus {
          outline: 2px solid #d4af37;
        }

        .almas-chat-formulario button {
          width: 44px;
          height: 44px;
          flex-shrink: 0;

          border: none;
          border-radius: 9px;

          background: #870d67;
          color: #fff;

          font-size: 18px;
          cursor: pointer;
        }

        .almas-chat-formulario button:disabled,
        .almas-chat-formulario input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .almas-chat-pie {
          padding: 0 12px 10px;
          flex-shrink: 0;

          text-align: center;
          font-size: 10px;

          color: #777;
          background: #fff;
        }

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

        .almas-chat-enlace {
          color: #870d67;
          text-decoration: underline;
          font-weight: 600;
        }

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

        .almas-chat-mensaje pre {
          max-width: 100%;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .almas-chat button:focus-visible,
        .almas-chat a:focus-visible {
          outline: 2px solid #d4af37;
          outline-offset: 3px;
        }

        @media (min-width: 360px) {
          .almas-chat-mensajes {
            padding: 16px;
          }
        }

        @media (min-width: 768px) {
          .almas-chat {
            right: calc(
              24px + env(safe-area-inset-right, 0px)
            );

            bottom: calc(
              24px + env(safe-area-inset-bottom, 0px)
            );
          }

          .almas-chat-ventana {
            bottom: 68px;
            width: 370px;

            max-height: calc(
              100dvh - 110px -
              env(safe-area-inset-top, 0px) -
              env(safe-area-inset-bottom, 0px)
            );
          }

          .almas-chat-header {
            padding: 16px 20px;
          }

          .almas-chat-boton {
            padding: 14px 20px;
            font-size: 14px;
          }
        }

        @media (min-width: 1200px) {
          .almas-chat-ventana {
            width: 400px;
            height: 540px;
          }
        }

        @media (orientation: landscape)
          and (max-height: 500px) {

          .almas-chat-ventana {
            bottom: 52px;
          }

          .almas-chat-header {
            padding: 4px 12px;
          }

          .almas-chat-mensajes {
            padding: 8px;
          }

          .almas-chat-formulario {
            padding: 6px;
          }

          .almas-chat-pie {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
