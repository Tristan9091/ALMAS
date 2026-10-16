"""
panel.py — Datos y operaciones del panel administrativo de ALMAS.

La autorización la aplica schema.py antes de llamar a estas funciones.
Los movimientos de pagos e inventario por cobros los realiza webhooks.py.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

import strawberry
from sqlmodel import Session, select

from database import engine, transaccion_pago
from models import DetallePedido, Pedido, Pago, Producto, Usuario, Variante


# Los pedidos con incidencias requieren revisión; no se cuentan como
# pedidos listos para surtir mientras no se resuelva la incidencia.
ESTADOS_PAGADOS = {"pagado", "en_preparacion", "enviado", "entregado"}

# Si un pago sigue abierto o no se sabe si fue cobrado, no se permite
# cancelar el pedido: podría aprobarse después de la cancelación.
ESTADOS_PAGO_BLOQUEANTES = {
    "enviando", "verificacion", "creado", "pending",
    "in_process", "authorized", "approved",
}

STOCK_BAJO = 3

# Los registros existentes guardan fechas UTC sin zona horaria.
ZONA_MEXICO = timezone(timedelta(hours=-6))


def _a_hora_mexico(fecha: datetime) -> datetime:
    """Convierte una fecha guardada como UTC a hora de México centro."""
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(ZONA_MEXICO)


def _utc(fecha: datetime) -> datetime:
    """Permite que el navegador interprete correctamente fechas en UTC."""
    return fecha.replace(tzinfo=timezone.utc) if fecha.tzinfo is None else fecha.astimezone(timezone.utc)


@strawberry.type
class VentaDiaType:
    fecha: str
    total: float
    pedidos: int


@strawberry.type
class ProductoAlertaType:
    id: int
    nombre: str
    stock: int


@strawberry.type
class PedidoRecienteType:
    id: int
    cliente: str
    email: str
    fecha: datetime
    total: float
    estatus: str
    estado_pago: Optional[str] = None


@strawberry.type
class ResumenAdminType:
    ventas_totales: float
    ventas_mes: float
    num_pedidos: int
    pedidos_pagados: int
    pedidos_pendientes: int
    productos_activos: int
    productos_stock_bajo: int
    productos_agotados: int
    umbral_stock_bajo: int
    ventas_por_dia: List[VentaDiaType]
    alertas_stock: List[ProductoAlertaType]
    pedidos_recientes: List[PedidoRecienteType]


def calcular_resumen(dias: int = 30, limite_recientes: int = 8) -> ResumenAdminType:
    dias = max(1, min(dias, 365))
    hoy = datetime.now(ZONA_MEXICO).date()
    inicio_periodo = hoy - timedelta(days=dias - 1)

    with Session(engine) as session:
        pedidos = session.exec(select(Pedido)).all()
        productos = session.exec(select(Producto)).all()

        # Pedidos que se pueden considerar ventas normales.
        # Una incidencia de cobro queda visible en pedidos/pagos, pero
        # no se confunde con una venta ya resuelta en estas estadísticas.
        pagados = [p for p in pedidos if p.estatus in ESTADOS_PAGADOS]
        ventas_totales = sum(p.total for p in pagados)
        ventas_mes = sum(
            p.total for p in pagados
            if (f := _a_hora_mexico(p.fecha)).year == hoy.year
            and f.month == hoy.month
        )

        por_dia = {
            (inicio_periodo + timedelta(days=i)).isoformat(): [0.0, 0]
            for i in range(dias)
        }
        for pedido in pagados:
            dia = _a_hora_mexico(pedido.fecha).date().isoformat()
            if dia in por_dia:
                por_dia[dia][0] += pedido.total
                por_dia[dia][1] += 1

        activos = [producto for producto in productos if producto.activo]
        stock_bajo = sorted(
            (producto for producto in activos if producto.stock <= STOCK_BAJO),
            key=lambda producto: (producto.stock, producto.nombre),
        )

        recientes = sorted(
            pedidos, key=lambda pedido: pedido.fecha, reverse=True
        )[:limite_recientes]
        ultimo_pago: dict[int, str] = {}
        if recientes:
            pagos = session.exec(
                select(Pago)
                .where(Pago.pedido_id.in_([pedido.id for pedido in recientes]))
                .order_by(Pago.fecha_actualizacion, Pago.id)
            ).all()
            for pago in pagos:
                ultimo_pago[pago.pedido_id] = pago.estado

        return ResumenAdminType(
            ventas_totales=round(ventas_totales, 2),
            ventas_mes=round(ventas_mes, 2),
            num_pedidos=len(pedidos),
            pedidos_pagados=len(pagados),
            pedidos_pendientes=sum(
                1 for pedido in pedidos if pedido.estatus == "pendiente"
            ),
            productos_activos=len(activos),
            productos_stock_bajo=len(stock_bajo),
            productos_agotados=sum(
                1 for producto in activos if producto.stock == 0
            ),
            umbral_stock_bajo=STOCK_BAJO,
            ventas_por_dia=[
                VentaDiaType(fecha=dia, total=round(total, 2), pedidos=numero)
                for dia, (total, numero) in por_dia.items()
            ],
            alertas_stock=[
                ProductoAlertaType(
                    id=producto.id,
                    nombre=producto.nombre,
                    stock=producto.stock,
                )
                for producto in stock_bajo[:6]
            ],
            pedidos_recientes=[
                PedidoRecienteType(
                    id=pedido.id,
                    cliente=pedido.nombre_comprador,
                    email=pedido.email_comprador,
                    fecha=_utc(pedido.fecha),
                    total=pedido.total,
                    estatus=pedido.estatus,
                    estado_pago=ultimo_pago.get(pedido.id),
                )
                for pedido in recientes
            ],
        )


# ============================================================
# Tipos y consultas para pedidos, pagos y clientes
# ============================================================

@strawberry.type
class DetallePedidoAdminType:
    producto: str
    variante: Optional[str]
    cantidad: int
    precio_unitario: float
    subtotal: float


@strawberry.type
class PedidoAdminType:
    id: int
    cliente: str
    email: str
    direccion: str
    fecha: datetime
    total: float
    estatus: str
    estado_pago: Optional[str]
    payment_id: Optional[str]
    # Novedad: permitir al administrador identificar el intento y la orden.
    pago_id: Optional[int]
    order_id: Optional[str]
    detalles: List[DetallePedidoAdminType]


@strawberry.type
class PagoAdminType:
    id: int
    pedido_id: int
    cliente: str
    email: str
    monto: float
    moneda: str
    estado: str
    estado_detalle: Optional[str]
    payment_id: Optional[str]
    fecha: datetime


@strawberry.type
class ClienteAdminType:
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool
    num_pedidos: int
    total_comprado: float
    ultimo_pedido: Optional[datetime]


def listar_pedidos() -> List[PedidoAdminType]:
    with Session(engine) as session:
        pedidos = session.exec(
            select(Pedido).order_by(Pedido.fecha.desc())
        ).all()
        productos = {
            producto.id: producto.nombre
            for producto in session.exec(select(Producto)).all()
        }
        variantes = {
            variante.id: f"{variante.tipo} {variante.valor}"
            for variante in session.exec(select(Variante)).all()
        }

        detalles_por_pedido: dict[int, list] = {}
        for detalle in session.exec(select(DetallePedido)).all():
            detalles_por_pedido.setdefault(detalle.pedido_id, []).append(detalle)

        ultimo_pago: dict[int, Pago] = {}
        for pago in session.exec(
            select(Pago).order_by(Pago.fecha_actualizacion, Pago.id)
        ).all():
            ultimo_pago[pago.pedido_id] = pago

        resultado: List[PedidoAdminType] = []
        for pedido in pedidos:
            pago = ultimo_pago.get(pedido.id)
            resultado.append(
                PedidoAdminType(
                    id=pedido.id,
                    cliente=pedido.nombre_comprador,
                    email=pedido.email_comprador,
                    direccion=pedido.direccion_envio,
                    fecha=_utc(pedido.fecha),
                    total=pedido.total,
                    estatus=pedido.estatus,
                    estado_pago=pago.estado if pago else None,
                    payment_id=pago.payment_id if pago else None,
                    pago_id=pago.id if pago else None,
                    order_id=pago.order_id if pago else None,
                    detalles=[
                        DetallePedidoAdminType(
                            producto=productos.get(
                                detalle.producto_id,
                                f"Producto {detalle.producto_id}",
                            ),
                            variante=(
                                variantes.get(detalle.variante_id)
                                if detalle.variante_id else None
                            ),
                            cantidad=detalle.cantidad,
                            precio_unitario=detalle.precio_unitario,
                            subtotal=round(
                                detalle.cantidad * detalle.precio_unitario, 2
                            ),
                        )
                        for detalle in detalles_por_pedido.get(pedido.id, [])
                    ],
                )
            )
        return resultado


def cancelar_pedido(pedido_id: int) -> PedidoAdminType:
    """
    Cancela solo pedidos pendientes sin cobro ni reserva activa.

    La transacción de escritura serializa esta operación con las reservas,
    respuestas de Mercado Pago y webhooks, evitando cancelaciones en carrera.
    """
    with transaccion_pago() as session:
        pedido = session.get(Pedido, pedido_id)
        if pedido is None:
            raise ValueError("El pedido no existe.")
        if pedido.estatus != "pendiente":
            raise ValueError("Solo se pueden cancelar pedidos pendientes de pago.")

        pagos = session.exec(
            select(Pago).where(Pago.pedido_id == pedido.id)
        ).all()
        if any(
            pago.estado in ESTADOS_PAGO_BLOQUEANTES
            or pago.inventario_aplicado
            for pago in pagos
        ):
            raise ValueError(
                "El pedido tiene un pago en proceso o una reserva activa. "
                "Verifica su estado en Mercado Pago antes de cancelarlo."
            )

        pedido.estatus = "cancelado"
        session.add(pedido)

    return next(p for p in listar_pedidos() if p.id == pedido_id)


def listar_pagos() -> List[PagoAdminType]:
    with Session(engine) as session:
        pagos = session.exec(
            select(Pago).order_by(Pago.fecha_actualizacion.desc(), Pago.id.desc())
        ).all()
        pedidos = {
            pedido.id: pedido
            for pedido in session.exec(select(Pedido)).all()
        }
        return [
            PagoAdminType(
                id=pago.id,
                pedido_id=pago.pedido_id,
                cliente=(
                    pedidos[pago.pedido_id].nombre_comprador
                    if pago.pedido_id in pedidos else "—"
                ),
                email=(
                    pedidos[pago.pedido_id].email_comprador
                    if pago.pedido_id in pedidos else ""
                ),
                monto=pago.monto,
                moneda=pago.moneda,
                estado=pago.estado,
                estado_detalle=pago.estado_detalle,
                payment_id=pago.payment_id,
                fecha=_utc(pago.fecha_actualizacion),
            )
            for pago in pagos
        ]


def listar_clientes() -> List[ClienteAdminType]:
    with Session(engine) as session:
        usuarios = session.exec(
            select(Usuario).order_by(Usuario.nombre)
        ).all()
        pedidos = session.exec(select(Pedido)).all()

        resultado: List[ClienteAdminType] = []
        for usuario in usuarios:
            suyos = [
                pedido for pedido in pedidos
                if pedido.usuario_id == usuario.id
            ]
            resultado.append(
                ClienteAdminType(
                    id=usuario.id,
                    nombre=usuario.nombre,
                    email=usuario.email,
                    rol=usuario.rol,
                    activo=usuario.activo,
                    num_pedidos=len(suyos),
                    total_comprado=round(
                        sum(
                            pedido.total
                            for pedido in suyos
                            if pedido.estatus in ESTADOS_PAGADOS
                        ),
                        2,
                    ),
                    ultimo_pedido=(
                        _utc(max(pedido.fecha for pedido in suyos))
                        if suyos else None
                    ),
                )
            )
        return resultado


def cambiar_estado_cliente(
    usuario_id: int, activo: bool, admin_id: int
) -> ClienteAdminType:
    """
    Solo se permite desactivar o reactivar clientes, no administradores.
    Un administrador no puede desactivarse a sí mismo.
    """
    if usuario_id == admin_id:
        raise ValueError("No puedes desactivar tu propia cuenta.")

    with Session(engine) as session:
        usuario = session.get(Usuario, usuario_id)
        if usuario is None:
            raise ValueError("El usuario no existe.")
        if usuario.rol != "cliente":
            raise ValueError(
                "Solo se pueden activar o desactivar cuentas de clientes."
            )
        usuario.activo = activo
        session.add(usuario)
        session.commit()

    return next(c for c in listar_clientes() if c.id == usuario_id)
