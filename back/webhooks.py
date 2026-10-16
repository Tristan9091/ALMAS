"""
webhooks.py — Aplica el resultado de un cobro y recibe avisos de Mercado Pago.

aplicar_orden() es el ÚNICO lugar que cambia pedidos, pagos e inventario
según lo que diga Mercado Pago. La usan:
  - la mutación pagarPedido, con la respuesta inmediata del cobro, y
  - el webhook, cuando Mercado Pago avisa después que una orden cambió
    (por ejemplo, un reembolso o un pago que estaba en revisión).
"""

import threading
from typing import Optional

from fastapi import APIRouter, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select

from database import engine
from models import Pedido, DetallePedido, Producto, Pago, ahora
from payments import ErrorMercadoPago, obtener_orden, validar_firma_webhook

router = APIRouter()

# La respuesta del cobro y el aviso del webhook pueden llegar casi al mismo
# tiempo. El candado hace que se procesen uno por uno, para no descontar
# el inventario dos veces.
_candado = threading.Lock()


def estado_interno(orden: dict) -> str:
    """
    Traduce el estado de una orden de Mercado Pago a los estados que usa
    la tabla Pago (y que ya entiende el panel de administración).
    """
    status = orden.get("status")
    detalle = orden.get("status_detail")

    if status == "refunded" or detalle == "refunded":
        return "refunded"
    if detalle == "charged_back":
        return "charged_back"
    if status == "processed":
        return "approved"
    if status == "failed":
        return "rejected"
    if status == "canceled":
        return "cancelled"
    if status == "processing":
        return "in_process"
    if status == "action_required":
        return "pending"
    return "creado"


def _primer_pago(orden: dict) -> dict:
    pagos = (orden.get("transactions") or {}).get("payments") or []
    return pagos[0] if pagos else {}


def _a_numero(valor) -> float | None:
    try:
        return float(valor) if valor not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _monto(orden: dict, estado: str) -> float:
    """
    Si se aprobó: lo que REALMENTE se cobró (para comparar con el pedido).
    Si no: lo que se intentó cobrar (para que el panel muestre el intento).
    """
    pago = _primer_pago(orden)
    if estado == "approved":
        candidatos = (orden.get("total_paid_amount"), pago.get("paid_amount"))
    else:
        candidatos = (orden.get("total_amount"), pago.get("amount"))
    for valor in candidatos:
        numero = _a_numero(valor)
        if numero is not None:
            return numero
    return 0.0


def aplicar_orden(orden: dict, pedido_esperado: Optional[int] = None) -> Optional[dict]:
    """
    Guarda el resultado de una orden y, si se aprobó, confirma el pedido y
    descuenta el inventario UNA sola vez. Se puede llamar varias veces con
    la misma orden sin efectos duplicados.
    """
    order_id = str(orden.get("id") or "")
    referencia = str(orden.get("external_reference") or "")
    if not order_id or not referencia.isdigit():
        print(f"[Pagos] Orden {order_id or '?'} sin referencia de pedido; se ignora.")
        return None
    pedido_id = int(referencia)

    if pedido_esperado is not None and pedido_id != pedido_esperado:
        raise ValueError("El pago no corresponde a este pedido.")

    estado = estado_interno(orden)
    pago_mp = _primer_pago(orden)
    estado_detalle = pago_mp.get("status_detail") or orden.get("status_detail")
    payment_id = pago_mp.get("id")
    moneda = orden.get("currency_id") or "MXN"
    monto = _monto(orden, estado)

    with _candado, Session(engine) as session:
        pedido = session.get(Pedido, pedido_id)
        if pedido is None:
            print(f"[Pagos] Orden {order_id}: el pedido {pedido_id} no existe.")
            return None

        # 1. Un registro de Pago por orden (cada intento de cobro es una orden).
        pago = session.exec(select(Pago).where(Pago.order_id == order_id)).first()
        if pago is None:
            pago = Pago(pedido_id=pedido.id, order_id=order_id, monto=monto, moneda=moneda)

        if payment_id:
            pago.payment_id = str(payment_id)
        pago.estado = estado
        pago.estado_detalle = estado_detalle
        pago.monto = monto
        pago.moneda = moneda
        pago.fecha_actualizacion = ahora()
        session.add(pago)

        # 2. Confirmar el pedido solo si se cobró exactamente lo que vale.
        monto_correcto = moneda == "MXN" and abs(monto - pedido.total) < 0.01

        if estado == "approved" and not monto_correcto:
            print(
                f"[Pagos] ALERTA pedido {pedido.id}: se cobraron {monto} {moneda} "
                f"pero el pedido vale {pedido.total} MXN. No se confirma."
            )

        elif estado == "approved":
            inventario_ya_descontado = session.exec(
                select(Pago).where(
                    Pago.pedido_id == pedido.id,
                    Pago.inventario_aplicado == True,  # noqa: E712
                )
            ).first()

            if not inventario_ya_descontado:
                detalles = session.exec(
                    select(DetallePedido).where(DetallePedido.pedido_id == pedido.id)
                ).all()
                for detalle in detalles:
                    producto = session.get(Producto, detalle.producto_id)
                    if producto is None:
                        continue
                    if producto.stock < detalle.cantidad:
                        print(
                            f"[Pagos] ALERTA pedido {pedido.id}: se vendieron "
                            f"{detalle.cantidad} de {producto.nombre} y solo había {producto.stock}."
                        )
                    producto.stock = max(0, producto.stock - detalle.cantidad)
                    session.add(producto)
                pago.inventario_aplicado = True

            if pedido.estatus == "cancelado":
                # El admin lo canceló mientras se cobraba; el dinero sí llegó.
                print(f"[Pagos] Pedido {pedido.id} estaba cancelado pero se pagó; se reactiva.")

            if pedido.estatus in ("pendiente", "cancelado"):
                pedido.estatus = "pagado"
                session.add(pedido)

        elif estado in ("refunded", "charged_back") and pedido.estatus == "pagado":
            pedido.estatus = "reembolsado"
            session.add(pedido)

        # Un cobro rechazado no cambia el pedido: sigue pendiente y el
        # cliente puede intentar con otra tarjeta.
        session.commit()

        return {
            "pedido_id": pedido.id,
            "estatus_pedido": pedido.estatus,
            "estado_pago": pago.estado,
            "estado_detalle": pago.estado_detalle,
            "total": pedido.total,
        }


def procesar_orden_mp(order_id: str) -> Optional[dict]:
    """Consulta la orden en Mercado Pago (nunca se confía en el aviso) y la aplica."""
    return aplicar_orden(obtener_orden(order_id))


@router.post("/webhooks/mercadopago")
async def webhook_mercadopago(request: Request):
    parametros = request.query_params

    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}
    if not isinstance(cuerpo, dict):
        cuerpo = {}

    tipo = parametros.get("type") or cuerpo.get("type") or ""
    data_id_url = parametros.get("data.id")
    data_id = data_id_url or (cuerpo.get("data") or {}).get("id")

    # Solo nos interesan los avisos de órdenes. Al resto se responde 200
    # para que Mercado Pago no lo vuelva a mandar.
    if tipo != "order" or not data_id:
        return Response(status_code=200)

    firma_valida = validar_firma_webhook(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        data_id_url or str(data_id),
    )
    if not firma_valida:
        print(f"[Webhook] Firma inválida para la orden {data_id}; se rechaza.")
        return Response(status_code=401)

    try:
        await run_in_threadpool(procesar_orden_mp, str(data_id))
    except ErrorMercadoPago as error:
        # Con un 500, Mercado Pago reintenta el aviso más tarde.
        print(f"[Webhook] No se pudo consultar la orden {data_id}: {error}")
        return Response(status_code=500)

    return Response(status_code=200)
