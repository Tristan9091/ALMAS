const ENDPOINT = "http://127.0.0.1:8000/graphql";

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
