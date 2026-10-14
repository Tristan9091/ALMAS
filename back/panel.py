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
from models import Pedido, Pago, Producto

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
