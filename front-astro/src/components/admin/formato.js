// Formatos compartidos por las páginas del panel.

const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pesosCompactos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** $12,799 o $12,799.50 */
export const dinero = (valor) => pesos.format(valor ?? 0);

/** $12.8 mil — para ejes de gráficas */
export const dineroCompacto = (valor) => pesosCompactos.format(valor ?? 0);

/** "12 oct 2026, 7:25 p.m." en la hora local del navegador */
export const fechaHora = (iso) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Recibe "AAAA-MM-DD" (ya en hora de México) y regresa "jue 8 oct" */
export const diaCorto = (aaaammdd, conDiaSemana = true) => {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", {
    weekday: conDiaSemana ? "short" : undefined,
    day: "numeric",
    month: "short",
  });
};
