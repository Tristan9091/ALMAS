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
