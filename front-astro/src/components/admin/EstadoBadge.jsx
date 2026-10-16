// Etiqueta de estado con ícono + texto (nunca solo color),
// para pedidos y para pagos de Mercado Pago.

const ESTADOS_PEDIDO = {
  pendiente: { texto: "Pendiente de pago", tono: "neutro", icono: "◷" },
  pagado: { texto: "Pagado", tono: "bien", icono: "✓" },
  en_preparacion: { texto: "En preparación", tono: "info", icono: "◐" },
  enviado: { texto: "Enviado", tono: "info", icono: "➜" },
  entregado: { texto: "Entregado", tono: "bien", icono: "✓✓" },
  reembolsado: { texto: "Reembolsado", tono: "critico", icono: "↺" },
  cancelado: { texto: "Cancelado", tono: "critico", icono: "✕" },

  // Se recibió o detectó un cobro que requiere revisión administrativa.
  incidencia_stock: {
    texto: "Incidencia de inventario",
    tono: "critico",
    icono: "!",
  },
  incidencia_monto: {
    texto: "Diferencia en cobro",
    tono: "critico",
    icono: "!",
  },
  incidencia_duplicado: {
    texto: "Posible cobro duplicado",
    tono: "critico",
    icono: "!",
  },
  incidencia_cancelado: {
    texto: "Cobro de pedido cancelado",
    tono: "critico",
    icono: "!",
  },
  incidencia_sin_intento: {
    texto: "Pago sin intento registrado",
    tono: "critico",
    icono: "!",
  },
  incidencia_tardia: {
    texto: "Cobro detectado tardíamente",
    tono: "critico",
    icono: "!",
  },
};

const ESTADOS_PAGO = {
  approved: { texto: "Aprobado", tono: "bien", icono: "✓" },
  authorized: { texto: "Autorizado", tono: "aviso", icono: "◷" },
  pending: { texto: "En proceso", tono: "aviso", icono: "◷" },
  in_process: { texto: "En revisión", tono: "aviso", icono: "◷" },
  rejected: { texto: "Rechazado", tono: "critico", icono: "✕" },
  cancelled: { texto: "Cancelado", tono: "critico", icono: "✕" },
  refunded: { texto: "Reembolsado", tono: "critico", icono: "↺" },
  charged_back: { texto: "Contracargo", tono: "critico", icono: "!" },
  creado: { texto: "Sin completar", tono: "neutro", icono: "…" },

  // Estados internos del proceso de reserva y cobro.
  enviando: { texto: "Enviando pago", tono: "aviso", icono: "◷" },
  verificacion: { texto: "Requiere verificación", tono: "critico", icono: "!" },
};

export default function EstadoBadge({ estado, tipo = "pedido" }) {
  if (!estado) {
    return <span className="badge badge-vacio">Sin pago</span>;
  }

  const tabla = tipo === "pago" ? ESTADOS_PAGO : ESTADOS_PEDIDO;
  const info = tabla[estado] ?? { texto: estado, tono: "neutro", icono: "•" };

  return (
    <span className={`badge badge-${info.tono}`}>
      <span aria-hidden="true">{info.icono}</span>
      {info.texto}
    </span>
  );
}
