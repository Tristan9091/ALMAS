"""
panel.py — Cálculos del dashboard de administración.

Aquí solo se calculan datos. Quién puede verlos lo decide schema.py,
que llama a requerir_admin() antes de usar cualquier función de este archivo.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

import strawberry
from sqlmodel import Session, select

from database import engine
from models import DetallePedido, Pedido, Pago, Producto, Usuario, Variante

# Estados de pedido cuyo pago ya fue confirmado por Mercado Pago.
# Solo estos cuentan como ventas.
ESTADOS_PAGADOS = {"pagado", "en_preparacion", "enviado", "entregado"}

# Un producto activo con esta cantidad o menos se considera "stock bajo".
STOCK_BAJO = 3

# Las fechas se guardan en UTC. México centro es UTC-6 todo el año
# (desde 2022 ya no hay horario de verano).
ZONA_MEXICO = timezone(timedelta(hours=-6))


def _a_hora_mexico(fecha: datetime) -> datetime:
    return fecha.replace(tzinfo=timezone.utc).astimezone(ZONA_MEXICO)


@strawberry.type
class VentaDiaType:
    fecha: str          # AAAA-MM-DD, hora de México
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

        # --- Ventas (solo pedidos con pago confirmado) ---
        pagados = [p for p in pedidos if p.estatus in ESTADOS_PAGADOS]
        ventas_totales = sum(p.total for p in pagados)
        ventas_mes = sum(
            p.total for p in pagados
            if (f := _a_hora_mexico(p.fecha)).year == hoy.year and f.month == hoy.month
        )

        # Un renglón por día del periodo, aunque ese día no haya ventas,
        # para que la gráfica muestre los días en cero.
        por_dia = {
            (inicio_periodo + timedelta(days=i)).isoformat(): [0.0, 0]
            for i in range(dias)
        }
        for p in pagados:
            dia = _a_hora_mexico(p.fecha).date().isoformat()
            if dia in por_dia:
                por_dia[dia][0] += p.total
                por_dia[dia][1] += 1

        # --- Productos ---
        activos = [p for p in productos if p.activo]
        stock_bajo = sorted(
            (p for p in activos if p.stock <= STOCK_BAJO),
            key=lambda p: (p.stock, p.nombre),
        )

        # --- Pedidos recientes, con el estado de su último pago ---
        recientes = sorted(pedidos, key=lambda p: p.fecha, reverse=True)[:limite_recientes]
        ultimo_pago = {}
        if recientes:
            pagos = session.exec(
                select(Pago)
                .where(Pago.pedido_id.in_([p.id for p in recientes]))
                .order_by(Pago.fecha_actualizacion, Pago.id)
            ).all()
            for pago in pagos:
                ultimo_pago[pago.pedido_id] = pago.estado  # el más reciente gana

        return ResumenAdminType(
            ventas_totales=round(ventas_totales, 2),
            ventas_mes=round(ventas_mes, 2),
            num_pedidos=len(pedidos),
            pedidos_pagados=len(pagados),
            pedidos_pendientes=sum(1 for p in pedidos if p.estatus == "pendiente"),
            productos_activos=len(activos),
            productos_stock_bajo=len(stock_bajo),
            productos_agotados=sum(1 for p in activos if p.stock == 0),
            umbral_stock_bajo=STOCK_BAJO,
            ventas_por_dia=[
                VentaDiaType(fecha=dia, total=round(total, 2), pedidos=n)
                for dia, (total, n) in por_dia.items()
            ],
            alertas_stock=[
                ProductoAlertaType(id=p.id, nombre=p.nombre, stock=p.stock)
                for p in stock_bajo[:6]
            ],
            pedidos_recientes=[
                PedidoRecienteType(
                    id=p.id,
                    cliente=p.nombre_comprador,
                    email=p.email_comprador,
                    # Con zona UTC explícita, el navegador la convierte bien a su hora local.
                    fecha=p.fecha.replace(tzinfo=timezone.utc),
                    total=p.total,
                    estatus=p.estatus,
                    estado_pago=ultimo_pago.get(p.id),
                )
                for p in recientes
            ],
        )


# ============================================================
#  Pedidos, pagos y clientes (pestañas del panel)
# ============================================================

def _utc(fecha: datetime) -> datetime:
    """Marca la fecha como UTC para que el navegador la muestre en su hora."""
    return fecha.replace(tzinfo=timezone.utc)


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
        pedidos = session.exec(select(Pedido).order_by(Pedido.fecha.desc())).all()
        productos = {p.id: p.nombre for p in session.exec(select(Producto)).all()}
        variantes = {v.id: f"{v.tipo} {v.valor}" for v in session.exec(select(Variante)).all()}

        detalles_por_pedido: dict[int, list] = {}
        for d in session.exec(select(DetallePedido)).all():
            detalles_por_pedido.setdefault(d.pedido_id, []).append(d)

        # El pago más reciente de cada pedido (si tiene).
        ultimo_pago: dict[int, Pago] = {}
        for pago in session.exec(select(Pago).order_by(Pago.fecha_actualizacion, Pago.id)).all():
            ultimo_pago[pago.pedido_id] = pago

        resultado = []
        for p in pedidos:
            pago = ultimo_pago.get(p.id)
            resultado.append(PedidoAdminType(
                id=p.id,
                cliente=p.nombre_comprador,
                email=p.email_comprador,
                direccion=p.direccion_envio,
                fecha=_utc(p.fecha),
                total=p.total,
                estatus=p.estatus,
                estado_pago=pago.estado if pago else None,
                payment_id=pago.payment_id if pago else None,
                detalles=[
                    DetallePedidoAdminType(
                        producto=productos.get(d.producto_id, f"Producto {d.producto_id}"),
                        variante=variantes.get(d.variante_id) if d.variante_id else None,
                        cantidad=d.cantidad,
                        precio_unitario=d.precio_unitario,
                        subtotal=round(d.cantidad * d.precio_unitario, 2),
                    )
                    for d in detalles_por_pedido.get(p.id, [])
                ],
            ))
        return resultado


def cancelar_pedido(pedido_id: int) -> PedidoAdminType:
    """
    Solo se cancelan pedidos PENDIENTES de pago. Un pedido pagado ya se
    cobró: cancelarlo requeriría devolver el dinero en Mercado Pago.
    Como un pedido pendiente nunca descontó inventario, no hay stock que regresar.
    """
    with Session(engine) as session:
        pedido = session.get(Pedido, pedido_id)
        if pedido is None:
            raise ValueError("El pedido no existe.")
        if pedido.estatus != "pendiente":
            raise ValueError("Solo se pueden cancelar pedidos pendientes de pago.")
        pedido.estatus = "cancelado"
        session.add(pedido)
        session.commit()

    return next(p for p in listar_pedidos() if p.id == pedido_id)


def listar_pagos() -> List[PagoAdminType]:
    with Session(engine) as session:
        pagos = session.exec(select(Pago).order_by(Pago.fecha_actualizacion.desc(), Pago.id.desc())).all()
        pedidos = {p.id: p for p in session.exec(select(Pedido)).all()}
        return [
            PagoAdminType(
                id=pago.id,
                pedido_id=pago.pedido_id,
                cliente=pedidos[pago.pedido_id].nombre_comprador if pago.pedido_id in pedidos else "—",
                email=pedidos[pago.pedido_id].email_comprador if pago.pedido_id in pedidos else "",
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
    # Nunca se consulta ni se regresa password_hash.
    with Session(engine) as session:
        usuarios = session.exec(select(Usuario).order_by(Usuario.nombre)).all()
        pedidos = session.exec(select(Pedido)).all()

        resultado = []
        for u in usuarios:
            suyos = [p for p in pedidos if p.usuario_id == u.id]
            resultado.append(ClienteAdminType(
                id=u.id,
                nombre=u.nombre,
                email=u.email,
                rol=u.rol,
                activo=u.activo,
                num_pedidos=len(suyos),
                total_comprado=round(sum(p.total for p in suyos if p.estatus in ESTADOS_PAGADOS), 2),
                ultimo_pedido=_utc(max(p.fecha for p in suyos)) if suyos else None,
            ))
        return resultado


def cambiar_estado_cliente(usuario_id: int, activo: bool, admin_id: int) -> ClienteAdminType:
    """
    Desactivar una cuenta le impide iniciar sesión y comprar; sus pedidos
    se conservan. Solo aplica a clientes: un admin no puede desactivarse
    a sí mismo ni a otro admin desde el panel.
    """
    if usuario_id == admin_id:
        raise ValueError("No puedes desactivar tu propia cuenta.")

    with Session(engine) as session:
        usuario = session.get(Usuario, usuario_id)
        if usuario is None:
            raise ValueError("El usuario no existe.")
        if usuario.rol != "cliente":
            raise ValueError("Solo se pueden activar o desactivar cuentas de clientes.")
        usuario.activo = activo
        session.add(usuario)
        session.commit()

    return next(c for c in listar_clientes() if c.id == usuario_id)
