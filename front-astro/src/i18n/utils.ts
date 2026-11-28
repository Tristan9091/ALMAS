export type Idioma = "es" | "en";

export function obtenerIdioma(pathname: string): Idioma {
  return /^\/en(?:\/|$)/.test(pathname) ? "en" : "es";
}

export function rutaLocalizada(ruta: string, idioma: Idioma): string {
  const rutaBase = ruta.replace(/^\/en(?=\/|$)/, "") || "/";

  if (idioma === "es") {
    return rutaBase;
  }

  return `/en${rutaBase}`;
}

export function traducir(
  idioma: Idioma,
  espanol: string,
  ingles: string,
): string {
  return idioma === "en" ? ingles : espanol;
}
