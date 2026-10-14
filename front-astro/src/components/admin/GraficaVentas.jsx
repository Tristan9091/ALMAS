import { useEffect, useRef, useState } from "react";
import { dinero, dineroCompacto, diaCorto } from "./formato";

// Medidas de la gráfica (en px).
const ALTO = 240;
const MARGEN = { arriba: 24, derecha: 8, abajo: 28, izquierda: 64 };
const ANCHO_MAX_BARRA = 24;   // las barras nunca llenan todo su espacio
const SEPARACION = 2;         // espacio mínimo entre barras vecinas
const RADIO = 4;              // esquinas redondeadas solo en la punta

/** Redondea el máximo del eje a un número "limpio" (1, 2, 2.5, 5 × 10^n). */
function maximoLimpio(valor) {
  if (valor <= 0) return 1000;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const paso = [1, 2, 2.5, 5, 10].find((p) => p * potencia >= valor);
  return paso * potencia;
}

/** Barra con la punta redondeada y la base recta, sobre la línea base. */
function rutaBarra(x, y, ancho, alto) {
  const r = Math.min(RADIO, ancho / 2, alto);
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
}

/**
 * Ventas confirmadas por día. Una sola serie, así que no lleva leyenda:
 * el título de la tarjeta dice qué se grafica.
 */
export default function GraficaVentas({ datos, titulo, subtitulo }) {
  const contenedor = useRef(null);
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState(null);
  const [verTabla, setVerTabla] = useState(false);

  // La gráfica se adapta al ancho de su tarjeta.
  useEffect(() => {
    if (!contenedor.current) return;
    const observador = new ResizeObserver(([entrada]) => {
      setAncho(Math.max(280, Math.floor(entrada.contentRect.width)));
    });
    observador.observe(contenedor.current);
    return () => observador.disconnect();
  }, [verTabla]);

  const conVentas = datos.filter((d) => d.total > 0);

  if (verTabla) {
    return (
      <div>
        <Encabezado titulo={titulo} subtitulo={subtitulo} verTabla={verTabla} onCambiar={setVerTabla} />
        <table className="admin-tabla tabla-compacta">
          <thead>
            <tr>
              <th>Día</th>
              <th className="num">Pedidos pagados</th>
              <th className="num">Ventas</th>
            </tr>
          </thead>
          <tbody>
            {conVentas.map((d) => (
              <tr key={d.fecha}>
                <td>{diaCorto(d.fecha)}</td>
                <td className="num">{d.pedidos}</td>
                <td className="num">{dinero(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="admin-nota">
          {conVentas.length === 0
            ? "No hubo ventas confirmadas en este periodo."
            : "Los días que no aparecen no tuvieron ventas confirmadas."}
        </p>
      </div>
    );
  }

  const interiorAncho = ancho - MARGEN.izquierda - MARGEN.derecha;
  const interiorAlto = ALTO - MARGEN.arriba - MARGEN.abajo;
  const maximo = maximoLimpio(Math.max(...datos.map((d) => d.total), 0));
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximo);

  const banda = interiorAncho / datos.length;
  const anchoBarra = Math.max(2, Math.min(ANCHO_MAX_BARRA, banda - SEPARACION));
  const yDe = (valor) => MARGEN.arriba + interiorAlto - (valor / maximo) * interiorAlto;

  // Solo se etiqueta el día más alto; el resto, en el tooltip y la tabla.
  const indiceMaximo = datos.reduce(
    (mejor, d, i) => (d.total > (datos[mejor]?.total ?? 0) ? i : mejor),
    -1,
  );

  // Etiquetas del eje X: una cada ~90px, para que no se encimen.
  const etiquetasQueCaben = Math.max(2, Math.floor(interiorAncho / 90));
  const cadaCuantos = Math.max(1, Math.ceil(datos.length / etiquetasQueCaben));

  const seleccion = activo !== null ? datos[activo] : null;
  const xTooltip = activo !== null ? MARGEN.izquierda + banda * activo + banda / 2 : 0;

  return (
    <div>
      <Encabezado titulo={titulo} subtitulo={subtitulo} verTabla={verTabla} onCambiar={setVerTabla} />

      <div ref={contenedor} className="grafica" onPointerLeave={() => setActivo(null)}>
        <svg
          width={ancho}
          height={ALTO}
          role="img"
          aria-label={`Ventas confirmadas por día. ${conVentas.length} días con ventas. Usa "Ver tabla" para leer los valores.`}
        >
          {/* Cuadrícula y eje Y: líneas finas y discretas */}
          {marcas.map((valor) => (
            <g key={valor}>
              <line
                className="grafica-rejilla"
                x1={MARGEN.izquierda}
                x2={ancho - MARGEN.derecha}
                y1={yDe(valor)}
                y2={yDe(valor)}
              />
              <text className="grafica-eje" x={MARGEN.izquierda - 8} y={yDe(valor)} dy="0.32em" textAnchor="end">
                {dineroCompacto(valor)}
              </text>
            </g>
          ))}

          {/* Barras */}
          {datos.map((d, i) => {
            const x = MARGEN.izquierda + banda * i + (banda - anchoBarra) / 2;
            const alto = (d.total / maximo) * interiorAlto;
            return (
              <g key={d.fecha}>
                {alto > 0 && (
                  <path
                    className={`grafica-barra${activo === i ? " activa" : ""}`}
                    d={rutaBarra(x, yDe(d.total), anchoBarra, alto)}
                  />
                )}
                {/* Zona de hover: toda la columna, más grande que la barra */}
                <rect
                  className="grafica-zona"
                  x={MARGEN.izquierda + banda * i}
                  y={MARGEN.arriba}
                  width={banda}
                  height={interiorAlto}
                  tabIndex={d.total > 0 ? 0 : -1}
                  aria-label={`${diaCorto(d.fecha)}: ${dinero(d.total)}`}
                  onPointerEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                />
                {i % cadaCuantos === 0 && (
                  <text className="grafica-eje" x={MARGEN.izquierda + banda * i + banda / 2} y={ALTO - 8} textAnchor="middle">
                    {diaCorto(d.fecha, false)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Etiqueta directa solo en el día con más ventas */}
          {indiceMaximo >= 0 && activo === null && (
            <text
              className="grafica-valor"
              x={MARGEN.izquierda + banda * indiceMaximo + banda / 2}
              y={yDe(datos[indiceMaximo].total) - 6}
              textAnchor="middle"
            >
              {dineroCompacto(datos[indiceMaximo].total)}
            </text>
          )}

          {/* Línea base */}
          <line
            className="grafica-base"
            x1={MARGEN.izquierda}
            x2={ancho - MARGEN.derecha}
            y1={yDe(0)}
            y2={yDe(0)}
          />
        </svg>

        {seleccion && (
          <div
            className="grafica-tooltip"
            style={{
              left: Math.min(Math.max(xTooltip, 70), ancho - 70),
              top: Math.max(yDe(seleccion.total) - 12, 8),
            }}
          >
            <strong>{dinero(seleccion.total)}</strong>
            <span>
              {diaCorto(seleccion.fecha)} · {seleccion.pedidos}{" "}
              {seleccion.pedidos === 1 ? "pedido" : "pedidos"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Encabezado({ titulo, subtitulo, verTabla, onCambiar }) {
  return (
    <div className="admin-tarjeta-titulo">
      <div>
        <h2>{titulo}</h2>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      <button className="admin-enlace" onClick={() => onCambiar(!verTabla)}>
        {verTabla ? "Ver gráfica" : "Ver tabla"}
      </button>
    </div>
  );
}
