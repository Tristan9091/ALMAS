import threading
from typing import Optional

from fastapi import APIRouter, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select

from database import engine
from models import Pedido, DetallePedido, Producto, Pago, ahora
from payments import ErrorMercadoPago, obtener_pago, validar_firma_webhook

router = APIRouter()

# Mercado Pago puede mandar dos avisos del mismo pago casi al mismo tiempo
# se procesa uno por uno para no descontar el inventario doble
_candado = threading.Lock()

ESTADOS_DEVUELTOS = {"refunded", "charged_back"}


def procesar_pago_mp(payment_id: str, pedido_esperado: Optional[int] = None) -> Optional[dict]:
    # Consulta un pago en Mercado Pago y aplica su estado a la base de datos.
    pago_mp = obtener_pago(payment_id)

    referencia = str(pago_mp.get("external_reference") or "")
    if not referencia.isdigit():
        print(f"[Webhook] Pago {payment_id} sin referencia de pedido; se ignora.")
        return None
    pedido_id = int(referencia)

    if pedido_esperado is not None and pedido_id != pedido_esperado:
        raise ValueError("El pago no corresponde a este pedido.")

    estado = pago_mp.get("status") or "desconocido"
    estado_detalle = pago_mp.get("status_detail")
    monto = float(pago_mp.get("transaction_amount") or 0)
    moneda = pago_mp.get("currency_id") or "MXN"

    with _candado, Session(engine) as session:
        pedido = session.get(Pedido, pedido_id)
        if pedido is None:
            print(f"[Webhook] Pago {payment_id}: el pedido {pedido_id} no existe.")
            return None

        # 1. Buscar el registro de este pago, o el intento que lo originó.
        pago = session.exec(
            select(Pago).where(Pago.payment_id == str(payment_id))
        ).first()

        if pago is None:
            pago = session.exec(
                select(Pago)
                .where(Pago.pedido_id == pedido.id, Pago.payment_id == None)  # noqa: E711
                .order_by(Pago.id.desc())
            ).first()

        if pago is None:
            # Un segundo intento con la misma preferencia: nuevo registro.
            pago = Pago(pedido_id=pedido.id, monto=monto, moneda=moneda)

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
                f"[Webhook] ALERTA pedido {pedido.id}: se cobraron {monto} {moneda} "
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
                            f"[Webhook] ALERTA pedido {pedido.id}: se vendieron "
                            f"{detalle.cantidad} de {producto.nombre} y solo había {producto.stock}."
                        )
                    producto.stock = max(0, producto.stock - detalle.cantidad)
                    session.add(producto)
                pago.inventario_aplicado = True

            if pedido.estatus == "cancelado":
                # El admin canceló el pedido, pero el cliente ya tenía abierta
                # la página de Mercado Pago y pagó. El dinero sí llegó, así que
                # el pedido se reactiva como pagado.
                print(f"[Webhook] Pedido {pedido.id} estaba cancelado pero se pagó; se reactiva.")

            if pedido.estatus in ("pendiente", "cancelado"):
                pedido.estatus = "pagado"
                session.add(pedido)

        elif estado in ESTADOS_DEVUELTOS and pedido.estatus == "pagado":
            pedido.estatus = "reembolsado"
            session.add(pedido)

        # Un pago rechazado no cambia el pedido, se puede intentar otra vez
        session.commit()

        return {
            "pedido_id": pedido.id,
            "estatus_pedido": pedido.estatus,
            "estado_pago": pago.estado,
            "total": pedido.total,
        }


@router.post("/webhooks/mercadopago")
async def webhook_mercadopago(request: Request):
    parametros = request.query_params

    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}
    if not isinstance(cuerpo, dict):
        cuerpo = {}

    tipo = (
        parametros.get("type")
        or parametros.get("topic")
        or cuerpo.get("type")
        or cuerpo.get("topic")
        or ""
    )
    data_id_url = parametros.get("data.id")
    data_id = data_id_url or (cuerpo.get("data") or {}).get("id")

    # Solo nos interesan los avisos de pagos. Al resto se responde 200
    # para que Mercado Pago no lo vuelva a mandar.
    if tipo != "payment" or not data_id:
        return Response(status_code=200)

    firma_valida = validar_firma_webhook(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        data_id_url or str(data_id),
    )
    if not firma_valida:
        print(f"[Webhook] Firma inválida para el pago {data_id}; se rechaza.")
        return Response(status_code=401)

    try:
        await run_in_threadpool(procesar_pago_mp, str(data_id))
    except ErrorMercadoPago as error:
        # Con un 500, Mercado Pago reintenta el aviso más tarde.
        print(f"[Webhook] No se pudo consultar el pago {data_id}: {error}")
        return Response(status_code=500)

    return Response(status_code=200)
