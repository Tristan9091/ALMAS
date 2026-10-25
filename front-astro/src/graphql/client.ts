// URL del backend. Para probar en tu computadora crea front-astro/.env con:
//   PUBLIC_GRAPHQL_URL=http://127.0.0.1:8000/graphql
// Si no existe la variable, se usa el backend publicado en Render.
import { createClient } from "graphql-ws";

const ENDPOINT =
  import.meta.env.PUBLIC_GRAPHQL_URL ?? "https://almas-1.onrender.com/graphql";

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(
      json.errors.map((error: { message: string }) => error.message).join(", "),
    );
  }

  return json.data;
}

export async function graphqlAuthRequest<T>(
  query: string,
  variables = {},
): Promise<T> {
  const token = localStorage.getItem("almas-token");

  if (!token) {
    throw new Error("No hay una sesión iniciada.");
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },

    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}
// Misma dirección que ENDPOINT, pero con ws:// o wss:// en vez de http(s)://
const WS_ENDPOINT = ENDPOINT.replace(/^http/, "ws");

/**
 * Abre una suscripción GraphQL por WebSocket.
 * Regresa una función para cerrarla (úsala al desmontar el componente).
 */
export function graphqlSubscribe<T>(
  query: string,
  onData: (data: T) => void,
  onError?: (mensaje: string) => void,
): () => void {
    const client = createClient({
    url: WS_ENDPOINT,
    // Se lee en cada (re)conexión, así un login nuevo usa el token nuevo.
    connectionParams: () => ({
      authorization: `Bearer ${localStorage.getItem("almas-token") ?? ""}`,
    }),
    retryAttempts: Infinity, // reconecta solo (Render se duerme)
    // Temporal, solo para diagnosticar:
    on: {
      connecting: () => console.log("[ws] conectando a", WS_ENDPOINT),
      opened: () => console.log("[ws] socket abierto"),
      connected: () => console.log("[ws] conectado y autenticado"),
      closed: (e) => console.log("[ws] cerrado:", e),
      error: (e) => console.log("[ws] error:", e),
    },
  });
  const dispose = client.subscribe<T>(
    { query },
    {
      next: (resultado) => {
        if (resultado.data) onData(resultado.data);
      },
      error: (err) => {
        const mensaje = Array.isArray(err)
          ? err.map((e) => e.message).join(", ")
          : "Se perdió la conexión en tiempo real.";
        onError?.(mensaje);
      },
      complete: () => {},
    },
  );

  return () => {
    dispose();
    client.dispose();
  };
}