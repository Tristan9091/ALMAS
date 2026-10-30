"""
webhooks.py — Registra los resultados de las órdenes de Mercado Pago.

aplicar_orden() centraliza los cambios de pedidos, pagos e inventario.
Se usa tanto en la respuesta directa del checkout como en los webhooks
(y en la conciliación administrativa).
"""

from typing import Optional

from fastapi import APIRouter, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select

from database import transaccion_pago
from events import publicar
from models import (
    DetallePedido,
    Pago,
    Pedido,
    Producto,
    NotificacionEmail,
    ahora,
)
from sqlalchemy.exc import IntegrityError
from payments import ErrorMercadoPago, obtener_orden, validar_firma_webhook

router = APIRouter()


# Estados del pedido que representan una venta ya reconocida.
ESTADOS_VENTA = {"pagado", "en_preparacion", "enviado", "entregado"}
ESTADOS_FINALIZADOS = ESTADOS_VENTA | {"reembolsado"}


def estado_interno(orden: dict) -> str:
    """Traduce el estado de Mercado Pago al estado interno del intento."""
    status = orden.get("status")
    detalle = orden.get("status_detail")

    if status == "refunded" or detalle == "refunded":
        return "refunded"
    if status == "charged_back" or detalle == "charged_back":
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
    transacciones = orden.get("transactions") or {}
    pagos = transacciones.get("payments") or []
    return pagos[0] if pagos and isinstance(pagos[0], dict) else {}


def _a_numero(valor) -> float | None:
    try:
        return float(valor) if valor not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _monto(orden: dict, estado: str) -> float:
    """Prioriza el monto efectivamente pagado si hubo aprobación."""
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


def _cantidades_pedido(session: Session, pedido_id: int) -> dict[int, int]:
    """Agrupa unidades por producto, aunque aparezca en varias variantes."""
    detalles = session.exec(
        select(DetallePedido).where(DetallePedido.pedido_id == pedido_id)
    ).all()
    cantidades: dict[int, int] = {}
    for detalle in detalles:
        if detalle.cantidad <= 0:
            raise ValueError(f"Cantidad inválida en el pedido {pedido_id}.")
        cantidades[detalle.producto_id] = (
            cantidades.get(detalle.producto_id, 0) + detalle.cantidad
        )
    return cantidades


def _devolver_stock(session: Session, pedido_id: int) -> None:
    """Devuelve una reserva; si falta un producto, aborta toda la transacción."""
    cantidades = _cantidades_pedido(session, pedido_id)
    if not cantidades:
        raise ValueError(f"El pedido {pedido_id} no tiene productos para devolver.")

    for producto_id, cantidad in cantidades.items():
        producto = session.get(Producto, producto_id)
        if producto is None:
            raise ValueError(
                f"No existe el producto {producto_id}; no se puede devolver stock."
            )
        producto.stock += cantidad
        session.add(producto)


def liberar_reserva(intento_id: int, revision_admin: bool = False) -> bool:
    """
    Revierte una reserva cuando la solicitud NO llegó al proveedor, o cuando
    un administrador verificó por separado que no hubo cobro.

    Nunca libera una reserva vinculada a una orden conocida. En los casos
    inciertos, la verificación humana es imprescindible.
    """
    with transaccion_pago() as session:
        pago = session.get(Pago, intento_id)
        estado_permitido = "verificacion" if revision_admin else "enviando"

        if (
            pago is None
            or pago.estado != estado_permitido
            or pago.order_id is not None
        ):
            raise ValueError("Este intento no se puede liberar automáticamente.")

        pedido = session.get(Pedido, pago.pedido_id)
        if pedido is None or pedido.estatus != "pendiente":
            raise ValueError("El pedido ya no permite liberar la reserva.")

        if pago.inventario_aplicado:
            _devolver_stock(session, pago.pedido_id)
            pago.inventario_aplicado = False

        pago.estado = "cancelled" if revision_admin else "rejected"
        pago.estado_detalle = (
            "sin_cobro_verificado_por_admin"
            if revision_admin
            else "error_sin_orden"
        )
        pago.fecha_actualizacion = ahora()
        session.add(pago)
        return True


def marcar_pago_incierto(intento_id: int) -> None:
    """Conserva la reserva cuando no sabemos si Mercado Pago cobró."""
    pedido_id = None
    with transaccion_pago() as session:
        pago = session.get(Pago, intento_id)
        if pago is not None and pago.estado == "enviando":
            pago.estado = "verificacion"
            pago.estado_detalle = "resultado_desconocido"
            pago.fecha_actualizacion = ahora()
            session.add(pago)
            pedido_id = pago.pedido_id
    # Fuera del "with": ya se confirmó la transacción.
    if pedido_id is not None:
        publicar(
            "pago_por_verificar",
            f"Pago por verificar del pedido #{pedido_id}",
            pedido_id,
        )


def _resumen_orden(pedido: Pedido, pago: Pago) -> dict:
    return {
        "pedido_id": pedido.id,
        "estatus_pedido": pedido.estatus,
        "estado_pago": pago.estado,
        "estado_detalle": pago.estado_detalle,
        "total": pedido.total,
    }


def _referencia_pedido(referencia: str) -> tuple[int, Optional[int]]:
    """Admite 'pedido_intento' y la referencia antigua 'pedido'."""
    partes = referencia.split("_")
    if len(partes) == 2 and all(p.isdigit() for p in partes):
        pedido_id, intento_id = map(int, partes)
    elif referencia.isdigit():
        pedido_id, intento_id = int(referencia), None
    else:
        raise ValueError("Referencia de Mercado Pago inválida.")

    if pedido_id <= 0 or (intento_id is not None and intento_id <= 0):
        raise ValueError("La referencia contiene identificadores inválidos.")
    return pedido_id, intento_id


def _evento_de_pago(pedido_id: int, estatus_pedido: str, estado_pago: str) -> tuple:
    """Traduce un cambio de pago a un evento (tipo, mensaje, pedido_id)."""
    if estatus_pedido.startswith("incidencia_"):
        return (
            "pago_incidencia",
            f"Incidencia en el pedido #{pedido_id} ({estatus_pedido})",
            pedido_id,
        )
    if estatus_pedido == "pagado":
        return ("pago_aprobado", f"Pago aprobado del pedido #{pedido_id}", pedido_id)
    if estado_pago in ("rejected", "cancelled"):
        return ("pago_rechazado", f"Pago rechazado del pedido #{pedido_id}", pedido_id)
    if estado_pago in ("refunded", "charged_back"):
        return ("pago_reembolsado", f"Pago reembolsado del pedido #{pedido_id}", pedido_id)
    return (
        "pago_actualizado",
        f"Pago del pedido #{pedido_id}: {estado_pago}",
        pedido_id,
    )

def registrar_confirmacion_pendiente(
    session: Session,
    pedido: Pedido,
) -> None:
    """
    Registra una confirmacion de compra sin enviar el correo.
    Debe ejecutarse dentro de la transaccion del pago.
    """

    existente = session.exec(
        select(NotificacionEmail).where(
            NotificacionEmail.pedido_id == pedido.id,
            NotificacionEmail.tipo == "confirmacion_compra",
        )
    ).first()

    if existente is not None:
        return

    notificacion = NotificacionEmail(
        pedido_id=pedido.id,
        tipo="confirmacion_compra",
        destinatario=pedido.email_comprador,
        estado="pendiente",
    )

    session.add(notificacion)

def _aplicar_orden(
    orden: dict,
    pedido_esperado: Optional[int] = None,
) -> tuple[Optional[dict], Optional[tuple]]:
    """Sincroniza una orden verificada con la base de datos (transacción única).

    Devuelve (resumen, evento). El evento solo existe si algo cambió de verdad
    y lo publica aplicar_orden() DESPUÉS de confirmar la transacción.
    """
    order_id = str(orden.get("id") or "").strip()
    referencia = str(orden.get("external_reference") or "").strip()
    if not order_id:
        print("[Pagos] Orden sin identificador.")
        return None, None

    try:
        pedido_id, intento_id = _referencia_pedido(referencia)
    except ValueError as error:
        print(f"[Pagos] Orden {order_id}: {error}")
        return None, None

    if pedido_esperado is not None and pedido_id != pedido_esperado:
        raise ValueError("La orden no corresponde al pedido solicitado.")

    estado = estado_interno(orden)
    pago_mp = _primer_pago(orden)
    estado_detalle = pago_mp.get("status_detail") or orden.get("status_detail")
    payment_id = pago_mp.get("id")
    moneda = orden.get("currency_id") or "MXN"
    monto = _monto(orden, estado)

    with transaccion_pago() as session:
        pedido = session.get(Pedido, pedido_id)
        if pedido is None:
            raise ValueError(f"No existe el pedido {pedido_id} de la orden {order_id}.")

        # Una orden existente siempre conserva el mismo registro de pago.
        pago = session.exec(select(Pago).where(Pago.order_id == order_id)).first()

        if pago is not None and intento_id is not None and pago.id != intento_id:
            raise ValueError("La referencia no coincide con el intento registrado.")

        if pago is None and intento_id is not None:
            pago = session.get(Pago, intento_id)
            if pago is None:
                # No crear un pago asociado a un intento desconocido.
                raise ValueError(
                    f"La orden {order_id} señala un intento inexistente: {intento_id}."
                )

        if pago is None and intento_id is None:
            # Compatibilidad con las órdenes creadas antes de tener intento_id.
            pago = session.exec(
                select(Pago)
                .where(
                    Pago.pedido_id == pedido.id,
                    Pago.order_id.is_(None),
                    Pago.estado.in_(["enviando", "verificacion"]),
                )
                .order_by(Pago.id.desc())
            ).first()

        if pago is None:
            pago = Pago(pedido_id=pedido.id, monto=monto, moneda=moneda)

        if pago.pedido_id != pedido.id:
            raise ValueError("El intento de pago pertenece a otro pedido.")
        if pago.order_id is not None and pago.order_id != order_id:
            raise ValueError("El intento ya está asociado a otra orden.")

        estado_previo = pago.estado
        detalle_previo = pago.estado_detalle
        estatus_previo = pedido.estatus

        # Una orden aprobada no retrocede por notificaciones retrasadas.
        if estado_previo == "approved" and estado in {
            "approved", "creado", "pending", "in_process", "rejected", "cancelled"
        }:
            return _resumen_orden(pedido, pago), None
        if estado_previo in ("refunded", "charged_back"):
            return _resumen_orden(pedido, pago), None
        if estado_previo in ("rejected", "cancelled") and estado in {
            "creado", "pending", "in_process"
        }:
            return _resumen_orden(pedido, pago), None

        pago.order_id = order_id
        if payment_id:
            pago.payment_id = str(payment_id)
        pago.estado = estado
        pago.estado_detalle = estado_detalle
        pago.monto = monto
        pago.moneda = moneda
        pago.fecha_actualizacion = ahora()
        session.add(pago)
        session.flush()

        monto_correcto = moneda == "MXN" and abs(monto - pedido.total) < 0.01

        if estado == "approved":
            liberado_anteriormente = (
                detalle_previo in {
                    "sin_cobro_verificado_por_admin", "error_sin_orden"
                }
                or estado_previo in {"rejected", "cancelled"}
            )

            otro_aplicado = session.exec(
                select(Pago).where(
                    Pago.pedido_id == pedido.id,
                    Pago.id != pago.id,
                    Pago.inventario_aplicado == True,  # noqa: E712
                )
            ).first()

            if liberado_anteriormente:
                pedido.estatus = "incidencia_tardia"
            elif otro_aplicado is not None:
                pedido.estatus = "incidencia_duplicado"
            elif pedido.estatus in ESTADOS_FINALIZADOS and not pago.inventario_aplicado:
                pedido.estatus = "incidencia_duplicado"
            elif pedido.estatus == "cancelado":
                pedido.estatus = "incidencia_cancelado"
            elif not monto_correcto:
                pedido.estatus = "incidencia_monto"
            elif pedido.estatus.startswith("incidencia_"):
                # Mantener las incidencias abiertas hasta revisión administrativa.
                pass
            elif pago.inventario_aplicado:
                # El stock ya fue reservado. No descontar nuevamente.
                if pedido.estatus == "pendiente":
                    pedido.estatus = "pagado"
            else:
                # Compatibilidad con cobros anteriores al sistema de reservas.
                cantidades = _cantidades_pedido(session, pedido.id)
                productos = {}
                disponible = bool(cantidades)

                for producto_id, cantidad in cantidades.items():
                    producto = session.get(Producto, producto_id)
                    if producto is None or producto.stock < cantidad:
                        disponible = False
                    else:
                        productos[producto_id] = producto

                if not disponible:
                    pedido.estatus = "incidencia_stock"
                else:
                    for producto_id, cantidad in cantidades.items():
                        producto = productos[producto_id]
                        producto.stock -= cantidad
                        session.add(producto)
                    pago.inventario_aplicado = True
                    pedido.estatus = "pagado"

            session.add(pedido)
            session.add(pago)
            if pedido.estatus.startswith("incidencia_"):
                print(
                    f"[Pagos] INCIDENCIA pedido {pedido.id}: "
                    f"{pedido.estatus}; orden {order_id}"
                )

        elif estado in ("rejected", "cancelled"):
            if pago.inventario_aplicado and pedido.estatus == "pendiente":
                _devolver_stock(session, pedido.id)
                pago.inventario_aplicado = False
                session.add(pago)

        elif estado in ("refunded", "charged_back"):
            if pedido.estatus == "pendiente" and pago.inventario_aplicado:
                # Reserva de una orden nunca consolidada como venta.
                _devolver_stock(session, pedido.id)
                pago.inventario_aplicado = False
                session.add(pago)
                pedido.estatus = "reembolsado"
                session.add(pedido)
            elif pedido.estatus in ESTADOS_VENTA:
                # No regresar automáticamente mercancía vendida/enviada.
                pedido.estatus = "reembolsado"
                session.add(pedido)
            # Una incidencia abierta no se cierra automáticamente.

                # Registrar la confirmacion solo cuando el pedido
        # pasa de un estado no pagado a "pagado".
        if estatus_previo != "pagado" and pedido.estatus == "pagado":
            registrar_confirmacion_pendiente(session, pedido)

        evento = None

        if pago.estado != estado_previo or pedido.estatus != estatus_previo:
            evento = _evento_de_pago(
                pedido.id,
                pedido.estatus,
                pago.estado,
            )

        return _resumen_orden(pedido, pago), evento

def aplicar_orden(
    orden: dict,
    pedido_esperado: Optional[int] = None,
) -> Optional[dict]:
    """Sincroniza la orden y, ya confirmada la transacción, avisa al backoffice."""
    resumen, evento = _aplicar_orden(orden, pedido_esperado)
    if evento is not None:
        publicar(*evento)
    return resumen


def procesar_orden_mp(order_id: str) -> Optional[dict]:
    """Consulta la orden real a Mercado Pago antes de actualizar datos."""
    resultado = aplicar_orden(obtener_orden(order_id))
    if resultado is None:
        raise ValueError(f"No se pudo asociar la orden {order_id} a un pedido.")
    return resultado


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
    datos = cuerpo.get("data") or {}
    data_id = data_id_url or (datos.get("id") if isinstance(datos, dict) else None)

    # Los eventos que no son de órdenes no requieren cambios en ALMAS.
    if tipo != "order" or not data_id:
        return Response(status_code=200)

    firma_valida = validar_firma_webhook(
        request.headers.get("x-signature"),
        request.headers.get("x-request-id"),
        data_id_url or str(data_id),
    )
    if not firma_valida:
        print(f"[Webhook] Firma inválida para la orden {data_id}.")
        return Response(status_code=401)

    try:
        await run_in_threadpool(procesar_orden_mp, str(data_id))
    except ErrorMercadoPago as error:
        print(f"[Webhook] No se pudo consultar la orden {data_id}: {error}")
        return Response(status_code=500)
    except Exception as error:
        print(f"[Webhook] Error aplicando la orden {data_id}: {error}")
        return Response(status_code=500)

    return Response(status_code=200)
