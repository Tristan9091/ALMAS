"""Esquema GraphQL de ALMAS: catálogo, clientes, pedidos y pagos.

Los cambios de inventario asociados a un cobro ocurren en webhooks.py.
La reserva previa y la creación del intento se realizan aquí en una
transacción SQLite, ANTES de contactar a Mercado Pago.
"""

from datetime import datetime
from typing import AsyncGenerator, List, Optional

import strawberry
from sqlmodel import Session, select
from strawberry.types import Info

from auth import (
    create_access_token,
    decode_access_token,
    get_token_from_header,
    hash_password,
    verify_password,
)
from database import engine, transaccion_pago
from events import publicar, suscribir
from models import (
    Categoria as CategoriaDB,
    DetallePedido as DetallePedidoDB,
    Pago as PagoDB,
    Pedido as PedidoDB,
    Producto as ProductoDB,
    Usuario as UsuarioDB,
    Variante as VarianteDB,
    ahora,
)
from panel import (
    STOCK_BAJO,
    ClienteAdminType,
    PagoAdminType,
    PedidoAdminType,
    ResumenAdminType,
    calcular_resumen,
    cambiar_estado_cliente as cambiar_estado_cliente_admin,
    cancelar_pedido as cancelar_pedido_admin,
    listar_clientes,
    listar_pagos,
    listar_pedidos,
)
from payments import ErrorMercadoPago, crear_orden, obtener_orden
from webhooks import aplicar_orden, liberar_reserva, marcar_pago_incierto


@strawberry.type
class VarianteType:
    id: int
    tipo: str
    valor: str


@strawberry.type
class ProductoType:
    id: int
    nombre: str
    descripcion: str
    precio: float
    imagen_url: str
    stock: int
    categoria_id: int
    variantes: List[VarianteType]
    activo: bool = True


def producto_a_type(p: ProductoDB, session: Session) -> ProductoType:
    variantes = session.exec(
        select(VarianteDB).where(VarianteDB.producto_id == p.id)
    ).all()
    return ProductoType(
        id=p.id,
        nombre=p.nombre,
        descripcion=p.descripcion,
        precio=p.precio,
        imagen_url=p.imagen_url,
        stock=p.stock,
        categoria_id=p.categoria_id,
        variantes=[
            VarianteType(id=v.id, tipo=v.tipo, valor=v.valor) for v in variantes
        ],
        activo=p.activo,
    )


@strawberry.type
class CategoriaType:
    id: int
    nombre: str
    imagenUrl: Optional[str] = None

    @strawberry.field
    def productos(self) -> List[ProductoType]:
        with Session(engine) as session:
            prods = session.exec(
                select(ProductoDB).where(
                    ProductoDB.categoria_id == self.id,
                    ProductoDB.activo == True,  # noqa: E712
                )
            ).all()
            return [producto_a_type(p, session) for p in prods]


@strawberry.type
class PedidoHistorialType:
    id: int
    nombre_comprador: str
    estatus: str
    total: float
    fecha: datetime


@strawberry.type
class DetalleMiPedidoType:
    producto_id: int
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    variante: Optional[str]
    imagen_url: Optional[str]


@strawberry.type
class MiPedidoType:
    id: int
    fecha: datetime
    estatus: str
    total: float
    direccion_envio: str
    estado_pago: Optional[str]
    detalles: List[DetalleMiPedidoType]


@strawberry.type
class EstadoPagoType:
    pedido_id: int
    estatus_pedido: str
    estado_pago: Optional[str]
    total: float


@strawberry.type
class Query:
    @strawberry.field
    def products(
        self,
        categoria_id: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[ProductoType]:
        with Session(engine) as session:
            consulta = select(ProductoDB).where(
                ProductoDB.activo == True  # noqa: E712
            )
            if categoria_id is not None:
                consulta = consulta.where(ProductoDB.categoria_id == categoria_id)
            consulta = consulta.offset(max(0, offset)).limit(max(0, min(limit, 100)))
            productos = session.exec(consulta).all()
            return [producto_a_type(p, session) for p in productos]

    @strawberry.field
    def product(self, id: int) -> Optional[ProductoType]:
        with Session(engine) as session:
            producto = session.get(ProductoDB, id)
            if producto is None or not producto.activo:
                return None
            return producto_a_type(producto, session)

    @strawberry.field
    def productos_admin(self, info: Info) -> List[ProductoType]:
        requerir_admin(info)
        with Session(engine) as session:
            productos = session.exec(
                select(ProductoDB).order_by(
                    ProductoDB.activo.desc(), ProductoDB.nombre
                )
            ).all()
            return [producto_a_type(p, session) for p in productos]

    @strawberry.field
    def categorias(self) -> List[CategoriaType]:
        with Session(engine) as session:
            categorias = session.exec(select(CategoriaDB)).all()
            return [
                CategoriaType(id=c.id, nombre=c.nombre, imagenUrl=c.imagen_url)
                for c in categorias
            ]

    @strawberry.field
    def categoria(self, id: int) -> Optional[CategoriaType]:
        with Session(engine) as session:
            categoria = session.get(CategoriaDB, id)
            if categoria is None:
                return None
            return CategoriaType(
                id=categoria.id,
                nombre=categoria.nombre,
                imagenUrl=categoria.imagen_url,
            )

    @strawberry.field
    def pedidos(self, info: Info) -> List[PedidoHistorialType]:
        requerir_admin(info)
        with Session(engine) as session:
            pedidos = session.exec(select(PedidoDB)).all()
            return [
                PedidoHistorialType(
                    id=p.id,
                    nombre_comprador=p.nombre_comprador,
                    estatus=p.estatus,
                    total=p.total,
                    fecha=p.fecha,
                )
                for p in pedidos
            ]

    @strawberry.field
    def mis_pedidos(self, info: Info) -> List[MiPedidoType]:
        """Historial del usuario autenticado; nunca expone pedidos ajenos."""
        usuario = obtener_usuario_actual(info)
        with Session(engine) as session:
            pedidos = session.exec(
                select(PedidoDB)
                .where(PedidoDB.usuario_id == usuario.id)
                .order_by(PedidoDB.fecha.desc(), PedidoDB.id.desc())
            ).all()
            resultado = []
            for pedido in pedidos:
                detalles_db = session.exec(
                    select(DetallePedidoDB).where(DetallePedidoDB.pedido_id == pedido.id)
                ).all()
                detalles = []
                for detalle in detalles_db:
                    producto = session.get(ProductoDB, detalle.producto_id)
                    variante = (
                        session.get(VarianteDB, detalle.variante_id)
                        if detalle.variante_id is not None
                        else None
                    )
                    detalles.append(DetalleMiPedidoType(
                        producto_id=detalle.producto_id,
                        nombre_producto=producto.nombre if producto else "Producto no disponible",
                        cantidad=detalle.cantidad,
                        precio_unitario=detalle.precio_unitario,
                        variante=(f"{variante.tipo}: {variante.valor}" if variante else None),
                        imagen_url=producto.imagen_url if producto else None,
                    ))
                ultimo_pago = session.exec(
                    select(PagoDB)
                    .where(PagoDB.pedido_id == pedido.id)
                    .order_by(PagoDB.fecha_actualizacion.desc(), PagoDB.id.desc())
                ).first()
                resultado.append(MiPedidoType(
                    id=pedido.id,
                    fecha=pedido.fecha,
                    estatus=pedido.estatus,
                    total=pedido.total,
                    direccion_envio=pedido.direccion_envio,
                    estado_pago=ultimo_pago.estado if ultimo_pago else None,
                    detalles=detalles,
                ))
            return resultado

    @strawberry.field
    def me(self, info: Info) -> "UsuarioType":
        return usuario_a_type(obtener_usuario_actual(info))

    @strawberry.field
    def pedidos_admin(self, info: Info) -> List[PedidoAdminType]:
        requerir_admin(info)
        return listar_pedidos()

    @strawberry.field
    def pagos_admin(self, info: Info) -> List[PagoAdminType]:
        requerir_admin(info)
        return listar_pagos()

    @strawberry.field
    def clientes_admin(self, info: Info) -> List[ClienteAdminType]:
        requerir_admin(info)
        return listar_clientes()

    @strawberry.field
    def resumen_admin(self, info: Info, dias: int = 30) -> ResumenAdminType:
        requerir_admin(info)
        return calcular_resumen(dias)

    @strawberry.field
    def estado_pedido(self, info: Info, pedido_id: int) -> EstadoPagoType:
        usuario = obtener_usuario_actual(info)
        with Session(engine) as session:
            pedido = session.get(PedidoDB, pedido_id)
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")
            ultimo = session.exec(
                select(PagoDB)
                .where(PagoDB.pedido_id == pedido.id)
                .order_by(PagoDB.fecha_actualizacion.desc(), PagoDB.id.desc())
            ).first()
            return EstadoPagoType(
                pedido_id=pedido.id,
                estatus_pedido=pedido.estatus,
                estado_pago=ultimo.estado if ultimo else None,
                total=pedido.total,
            )


@strawberry.input
class ProductoInput:
    nombre: str
    descripcion: str
    precio: float
    imagen_url: str
    stock: int
    categoria_id: int


@strawberry.input
class DetallePedidoInput:
    producto_id: int
    variante_id: Optional[int] = None
    cantidad: int
    # El navegador puede enviarlo por compatibilidad, pero nunca se utiliza.
    precio_unitario: Optional[float] = None


@strawberry.input
class PedidoInput:
    nombre_comprador: str
    email_comprador: str
    direccion_envio: str
    detalles: List[DetallePedidoInput]


@strawberry.type
class PedidoType:
    id: int
    nombre_comprador: str
    estatus: str
    total: float


@strawberry.input
class PagoTarjetaInput:
    pedido_id: int
    token: str
    metodo_pago: str
    tipo_pago: str
    email_pagador: str
    cuotas: int = 1


@strawberry.type
class ResultadoPagoType:
    pedido_id: int
    aprobado: bool
    estatus_pedido: str
    estado_pago: str
    mensaje: str
    total: float



MENSAJES_RECHAZO = {
    # Fondos insuficientes
    "card_insufficient_amount":
        "Tu tarjeta no tiene fondos suficientes para realizar la compra.",
    "insufficient_amount":
        "Tu tarjeta no tiene fondos suficientes para realizar la compra.",
    "cc_rejected_insufficient_amount":
        "Tu tarjeta no tiene fondos suficientes para realizar la compra.",

    # Codigo de seguridad
    "bad_filled_security_code":
        "El codigo de seguridad (CVV) es incorrecto. Revisalo e intenta nuevamente.",
    "cc_rejected_bad_filled_security_code":
        "El codigo de seguridad (CVV) es incorrecto. Revisalo e intenta nuevamente.",

    # Fecha de vencimiento
    "bad_filled_date":
        "La fecha de vencimiento de la tarjeta es incorrecta.",
    "expired_card":
        "Tu tarjeta esta vencida. Utiliza otra tarjeta.",
    "cc_rejected_bad_filled_date":
        "La fecha de vencimiento de la tarjeta es incorrecta.",
    "cc_rejected_card_expired":
        "Tu tarjeta esta vencida. Utiliza otra tarjeta.",

    # Datos de la tarjeta
    "bad_filled_card_data":
        "Los datos de la tarjeta son incorrectos. Revisalos e intenta nuevamente.",
    "invalid_card_token":
        "Los datos de la tarjeta expiraron. Vuelve a ingresarlos.",

    # Autorizacion bancaria
    "rejected_by_issuer":
        "Tu banco rechazo el pago. Contacta a tu banco o utiliza otra tarjeta.",
    "required_call_for_authorize":
        "Tu banco necesita autorizar esta compra. Contactalo para continuar.",
    "cc_rejected_call_for_authorize":
        "Tu banco necesita autorizar esta compra. Contactalo para continuar.",

    # Tarjeta deshabilitada
    "card_disabled":
        "Tu tarjeta esta deshabilitada. Utiliza otra tarjeta.",
    "cc_rejected_card_disabled":
        "Tu tarjeta esta deshabilitada. Utiliza otra tarjeta.",

    # Seguridad
    "high_risk":
        "El pago fue rechazado por motivos de seguridad. Utiliza otro metodo de pago.",
    "cc_rejected_high_risk":
        "El pago fue rechazado por motivos de seguridad.",

    # Limites
    "amount_limit_exceeded":
        "El monto de la compra supera el limite permitido por tu tarjeta.",
    "max_attempts_exceeded":
        "Superaste el numero de intentos permitidos. Intenta mas tarde.",
    "invalid_installments":
        "Tu tarjeta no permite el numero de mensualidades seleccionado.",

    # Pagos duplicados
    "duplicated_payment":
        "Se detecto un posible pago duplicado. Revisa tus pedidos antes de continuar.",

    # Otros rechazos
    "cc_rejected_other_reason":
        "Tu banco no pudo aprobar el pago. Intenta con otra tarjeta.",
}




def mensaje_resultado(estado: str, detalle: Optional[str]) -> str:

    if estado == "approved":
        return "Tu pago fue aprobado. Ya estamos preparando tus joyas."

    if estado in ("in_process", "pending", "authorized", "creado"):
        return (
            "Tu pago esta pendiente de confirmacion. "
            "No realices otro intento hasta conocer el resultado."
        )

    if estado in ("refunded", "charged_back"):
        return (
            "El pago fue devuelto. "
            "Contacta a la tienda si tienes alguna duda."
        )

    if estado == "cancelled":
        return "El pago fue cancelado. Puedes intentar nuevamente."

    if estado == "rejected":
        codigo = (detalle or "").strip().lower()

        return MENSAJES_RECHAZO.get(
            codigo,
            "Tu pago fue rechazado. "
            "Verifica los datos de tu tarjeta o intenta con otra."
        )

    return (
        "No pudimos confirmar el estado de tu pago. "
        "Consulta tus pedidos antes de volver a intentarlo."
    )



@strawberry.input
class RegistroInput:
    nombre: str
    email: str
    password: str


@strawberry.input
class LoginInput:
    email: str
    password: str


@strawberry.type
class UsuarioType:
    id: int
    nombre: str
    email: str
    rol: str


def usuario_a_type(usuario: UsuarioDB) -> UsuarioType:
    return UsuarioType(
        id=usuario.id,
        nombre=usuario.nombre,
        email=usuario.email,
        rol=usuario.rol,
    )


@strawberry.type
class AuthPayload:
    token: str
    usuario: UsuarioType


def _token_desde_contexto(info: Info) -> Optional[str]:
    """HTTP: header Authorization. WebSocket: connection_params (el navegador
    no puede poner headers en un WebSocket)."""
    params = info.context.get("connection_params")
    if isinstance(params, dict):
        autorizacion = params.get("authorization") or params.get("Authorization")
        if autorizacion:
            return get_token_from_header(str(autorizacion))
    return get_token_from_header(
        info.context["request"].headers.get("Authorization")
    )


def obtener_usuario_actual(info: Info) -> UsuarioDB:
    token = _token_desde_contexto(info)
    if not token:
        raise ValueError("No autenticado.")

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise ValueError("Token inválido o expirado.")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise ValueError("Token inválido.") from None

    with Session(engine) as session:
        usuario = session.get(UsuarioDB, user_id)
        if usuario is None:
            raise ValueError("Usuario no encontrado.")
        if not usuario.activo:
            raise ValueError("Usuario inactivo.")
        return usuario


def requerir_admin(info: Info) -> UsuarioDB:
    usuario = obtener_usuario_actual(info)
    if usuario.rol != "admin":
        raise ValueError("No tienes permiso para realizar esta acción.")
    return usuario


def validar_producto(data: ProductoInput, session: Session) -> dict:
    nombre = data.nombre.strip()
    descripcion = data.descripcion.strip()
    imagen_url = data.imagen_url.strip()

    if not nombre:
        raise ValueError("El nombre es obligatorio.")
    if not descripcion:
        raise ValueError("La descripción es obligatoria.")
    if data.precio <= 0:
        raise ValueError("El precio debe ser mayor a cero.")
    if data.stock < 0:
        raise ValueError("El stock no puede ser negativo.")
    if not imagen_url.startswith(("http://", "https://")):
        raise ValueError("La imagen debe ser una URL que empiece con http:// o https://.")
    if session.get(CategoriaDB, data.categoria_id) is None:
        raise ValueError("La categoría elegida no existe.")

    return {
        "nombre": nombre,
        "descripcion": descripcion,
        "precio": round(float(data.precio), 2),
        "imagen_url": imagen_url,
        "stock": int(data.stock),
        "categoria_id": data.categoria_id,
    }


def _registrar_orden_no_aplicada(intento_id: int, orden: dict) -> None:
    """Conserva el ID conocido para poder conciliar una respuesta no aplicada.

    No modifica cobros ni stock y nunca degrada un estado ya confirmado por
    otro webhook concurrente.
    """
    order_id = str(orden.get("id") or "").strip()
    if not order_id:
        marcar_pago_incierto(intento_id)
        return

    with transaccion_pago() as session:
        pago = session.get(PagoDB, intento_id)
        if pago is None:
            raise ValueError(f"Intento de pago {intento_id} no encontrado.")
        if pago.order_id is not None and pago.order_id != order_id:
            raise ValueError("El intento está asociado a otra orden.")
        if pago.estado in ("enviando", "verificacion"):
            pago.order_id = order_id
            pago.estado = "verificacion"
            pago.estado_detalle = "resultado_desconocido"
            pago.fecha_actualizacion = ahora()
            session.add(pago)


def _mensaje_pago(resumen: dict) -> str:
    estado_pedido = resumen["estatus_pedido"]
    if estado_pedido.startswith("incidencia_"):
        return (
            "Mercado Pago registró un cobro, pero el pedido necesita revisión. "
            "No vuelvas a pagarlo; contacta a la tienda."
        )
    return mensaje_resultado(resumen["estado_pago"], resumen["estado_detalle"])


@strawberry.type
class Mutation:

    @strawberry.mutation
    def cancelar_mi_pedido(self, info: Info, pedido_id: int) -> bool:
        usuario = obtener_usuario_actual(info)

        with transaccion_pago() as session:
            pedido = session.get(PedidoDB, pedido_id)

            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("El pedido no existe o no te pertenece.")

            if pedido.estatus != "pendiente":
                raise ValueError(
                    "Solo puedes cancelar pedidos pendientes de pago."
                )

            pagos = session.exec(
                select(PagoDB).where(PagoDB.pedido_id == pedido.id)
            ).all()

            # Ningun pago puede seguir activo, incierto o con
            # inventario reservado.
            estados_bloqueantes = {
                "enviando",
                "verificacion",
                "creado",
                "pending",
                "in_process",
                "authorized",
                "approved",
            }

            if any(
                pago.estado in estados_bloqueantes
                or pago.inventario_aplicado
                for pago in pagos
            ):
                raise ValueError(
                    "Este pedido tiene un pago en proceso o por verificar. "
                    "No puedes cancelarlo hasta confirmar su resultado."
                )

            pedido.estatus = "cancelado"
            session.add(pedido)

        publicar(
            "pedido_cancelado",
            f"Pedido #{pedido_id} cancelado por el cliente",
            pedido_id,
        )

        return True

    @strawberry.mutation
    def crear_producto(self, info: Info, data: ProductoInput) -> ProductoType:
        requerir_admin(info)
        with transaccion_pago() as session:
            valores = validar_producto(data, session)
            nuevo = ProductoDB(**valores)
            session.add(nuevo)
            session.flush()
            resultado = producto_a_type(nuevo, session)
        return resultado

    @strawberry.mutation
    def actualizar_producto(
        self, info: Info, id: int, data: ProductoInput
    ) -> ProductoType:
        requerir_admin(info)
        # Usa la misma exclusión de escritura que las reservas de inventario.
        with transaccion_pago() as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                raise ValueError("El producto no existe.")
            for campo, valor in validar_producto(data, session).items():
                setattr(producto, campo, valor)
            session.add(producto)
            session.flush()
            resultado = producto_a_type(producto, session)
        return resultado

    @strawberry.mutation
    def cancelar_pedido(self, info: Info, id: int) -> PedidoAdminType:
        requerir_admin(info)
        pedido = cancelar_pedido_admin(id)
        publicar("pedido_cancelado", f"Pedido #{id} cancelado", id)
        return pedido

    @strawberry.mutation
    def cambiar_estado_cliente(
        self, info: Info, id: int, activo: bool
    ) -> ClienteAdminType:
        admin = requerir_admin(info)
        return cambiar_estado_cliente_admin(id, activo, admin.id)

    @strawberry.mutation
    def cambiar_estado_producto(
        self, info: Info, id: int, activo: bool
    ) -> ProductoType:
        requerir_admin(info)
        with transaccion_pago() as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                raise ValueError("El producto no existe.")
            producto.activo = activo
            session.add(producto)
            session.flush()
            resultado = producto_a_type(producto, session)
        return resultado

    @strawberry.mutation
    def actualizar_stock(
        self, info: Info, id: int, nuevo_stock: int
    ) -> Optional[ProductoType]:
        requerir_admin(info)
        if nuevo_stock < 0:
            raise ValueError("El stock no puede ser negativo.")
        with transaccion_pago() as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                return None
            producto.stock = nuevo_stock
            session.add(producto)
            session.flush()
            resultado = producto_a_type(producto, session)
        if nuevo_stock <= STOCK_BAJO:
            publicar(
                "stock_bajo",
                f"Stock bajo: {resultado.nombre} ({nuevo_stock} pzas)",
            )
        return resultado

    @strawberry.mutation
    def eliminar_producto(self, info: Info, id: int) -> bool:
        # Desactivación lógica: conserva las referencias de pedidos históricos.
        requerir_admin(info)
        with transaccion_pago() as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                return False
            producto.activo = False
            session.add(producto)
        return True

    @strawberry.mutation
    def crear_pedido(self, info: Info, data: PedidoInput) -> PedidoType:
        """Crea un pedido pendiente, tomando los precios de la base.

        Los detalles y su pedido se guardan en la misma transacción.
        El inventario se reserva solamente cuando se inicia el pago.
        """
        usuario = obtener_usuario_actual(info)
        if not data.detalles:
            raise ValueError("El pedido no tiene productos.")

        with transaccion_pago() as session:
            renglones = []
            cantidades: dict[int, int] = {}

            for detalle in data.detalles:
                if detalle.cantidad <= 0:
                    raise ValueError("Las cantidades deben ser mayores a cero.")
                producto = session.get(ProductoDB, detalle.producto_id)
                if producto is None or not producto.activo:
                    raise ValueError(
                        f"El producto {detalle.producto_id} ya no está disponible."
                    )

                if detalle.variante_id is not None:
                    variante = session.get(VarianteDB, detalle.variante_id)
                    if variante is None or variante.producto_id != producto.id:
                        raise ValueError(
                            f"La variante elegida no corresponde a {producto.nombre}."
                        )

                cantidades[producto.id] = (
                    cantidades.get(producto.id, 0) + detalle.cantidad
                )
                if cantidades[producto.id] > producto.stock:
                    raise ValueError(
                        f"Solo quedan {producto.stock} piezas de {producto.nombre}."
                    )
                renglones.append((detalle, float(producto.precio)))

            total = round(
                sum(detalle.cantidad * precio for detalle, precio in renglones),
                2,
            )
            pedido = PedidoDB(
                nombre_comprador=data.nombre_comprador,
                email_comprador=data.email_comprador,
                direccion_envio=data.direccion_envio,
                estatus="pendiente",
                total=total,
                usuario_id=usuario.id,
            )
            session.add(pedido)
            session.flush()

            for detalle, precio in renglones:
                session.add(
                    DetallePedidoDB(
                        pedido_id=pedido.id,
                        producto_id=detalle.producto_id,
                        variante_id=detalle.variante_id,
                        cantidad=detalle.cantidad,
                        precio_unitario=precio,
                    )
                )

            resultado = PedidoType(
                id=pedido.id,
                nombre_comprador=pedido.nombre_comprador,
                estatus=pedido.estatus,
                total=pedido.total,
            )
        publicar(
            "pedido_creado",
            f"Nuevo pedido #{resultado.id} de {resultado.nombre_comprador} "
            f"por ${resultado.total:,.2f}",
            resultado.id,
        )
        return resultado

    @strawberry.mutation
    def pagar_pedido(self, info: Info, data: PagoTarjetaInput) -> ResultadoPagoType:
        """Reserva inventario de forma atómica y después contacta a Mercado Pago."""
        usuario = obtener_usuario_actual(info)

        if data.tipo_pago not in ("credit_card", "debit_card"):
            raise ValueError("Solo se aceptan tarjetas de crédito o débito.")
        token = data.token.strip() if data.token else ""
        if not token:
            raise ValueError("Faltan los datos de la tarjeta.")
        if not data.metodo_pago or not data.metodo_pago.strip():
            raise ValueError("Falta indicar el método de pago.")
        if data.cuotas < 1:
            raise ValueError("El número de cuotas debe ser mayor que cero.")

        # BEGIN IMMEDIATE impide que dos solicitudes reserven el mismo stock
        # o abran dos cobros sobre el mismo pedido al mismo tiempo.
        with transaccion_pago() as session:
            pedido = session.get(PedidoDB, data.pedido_id)
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")
            if pedido.estatus != "pendiente":
                raise ValueError("Este pedido ya no está pendiente de pago.")

            pago_abierto = session.exec(
                select(PagoDB).where(
                    PagoDB.pedido_id == pedido.id,
                    PagoDB.estado.in_([
                        "enviando", "verificacion", "creado", "pending",
                        "in_process", "authorized", "approved",
                    ]),
                )
            ).first()
            if pago_abierto is not None:
                raise ValueError(
                    "Ya existe un intento de pago en proceso o por verificar. "
                    "No intentes cobrar este pedido otra vez."
                )

            detalles = session.exec(
                select(DetallePedidoDB).where(
                    DetallePedidoDB.pedido_id == pedido.id
                )
            ).all()
            if not detalles:
                raise ValueError("El pedido no tiene productos.")

            bajos: list[tuple[str, int]] = []
            cantidades: dict[int, int] = {}
            for detalle in detalles:
                if detalle.cantidad <= 0:
                    raise ValueError("El pedido contiene cantidades inválidas.")
                cantidades[detalle.producto_id] = (
                    cantidades.get(detalle.producto_id, 0) + detalle.cantidad
                )

            for producto_id, cantidad in cantidades.items():
                producto = session.get(ProductoDB, producto_id)
                if producto is None or not producto.activo:
                    raise ValueError(
                        "Uno de los productos del pedido ya no está disponible."
                    )
                if producto.stock < cantidad:
                    raise ValueError(
                        f"Ya no hay stock suficiente de {producto.nombre}."
                    )
                producto.stock -= cantidad
                session.add(producto)
                if producto.stock <= STOCK_BAJO:
                    bajos.append((producto.nombre, producto.stock))

            # Conservar un único registro por intento y su reserva.
            pago = PagoDB(
                pedido_id=pedido.id,
                monto=pedido.total,
                moneda="MXN",
                estado="enviando",
                inventario_aplicado=True,
            )
            session.add(pago)
            session.flush()

            intento_id = pago.id
            clave_idempotencia = pago.clave_idempotencia
            pedido_id, total = pedido.id, pedido.total

        # Ya se confirmó la reserva: avisar de los productos que quedaron bajos.
        for nombre_producto, existencias in bajos:
            publicar(
                "stock_bajo",
                f"Stock bajo: {nombre_producto} ({existencias} pzas)",
            )

        try:
            orden = crear_orden(
            pedido_id=pedido_id,
            monto=total,
            token=token,
            metodo_pago=data.metodo_pago,
            tipo_pago=data.tipo_pago,
            cuotas=data.cuotas,
            email_pagador=data.email_pagador,
            intento_id=intento_id,
            clave_idempotencia=clave_idempotencia,
        )
        
        except ErrorMercadoPago as error:
            print(
                f"[Mercado Pago] Pedido {pedido_id}, "
                f"intento {intento_id}: {error}"
            )

            # Si no sabemos si hubo cobro, bloqueamos otro intento.
            if error.resultado_incierto:
                marcar_pago_incierto(intento_id)

                raise ValueError(
                    "PAGO_INCIERTO: No pudimos confirmar el resultado del pago. "
                    "No vuelvas a intentar pagar este pedido "
                    "hasta verificarlo con la tienda."
                ) from error

            # La solicitud no genero una orden aceptada.
            # Liberamos la reserva antes de responder.
            try:
                liberar_reserva(intento_id)
            except ValueError:
                raise ValueError(
                    "El resultado del pago cambio mientras se procesaba. "
                    "Verifica tu pedido antes de volver a pagar."
                ) from error

            # Errores de configuracion o autorizacion del comercio.
            if error.http_status in (401, 403):
                mensaje = (
                    "No pudimos procesar el pago por un problema "
                    "con el servicio de pagos. Intenta mas tarde."
                )
            else:
                mensaje = mensaje_resultado(
                    "rejected",
                    error.codigo
                )

            return ResultadoPagoType(
                pedido_id=pedido_id,
                aprobado=False,
                estatus_pedido="pendiente",
                estado_pago="rejected",
                mensaje=mensaje,
                total=total,
            )

        try:
            resumen = aplicar_orden(orden, pedido_esperado=pedido_id)
            if resumen is None:
                raise ValueError("La respuesta de Mercado Pago no se pudo asociar.")
        except Exception as error:
            print(
                f"[Pagos] Error registrando pedido {pedido_id}, "
                f"intento {intento_id}: {error}"
            )
            # Tenemos un ID de orden; registrarlo para facilitar la conciliación.
            try:
                _registrar_orden_no_aplicada(intento_id, orden)
            except Exception as error_registro:
                print(
                    f"[Pagos] No se pudo guardar la orden para conciliar: "
                    f"{error_registro}"
                )
                marcar_pago_incierto(intento_id)
            raise ValueError(
                "No pudimos confirmar el resultado del pago. "
                "No vuelvas a intentar pagar este pedido hasta verificarlo con la tienda."
            ) from error

        return ResultadoPagoType(
            pedido_id=pedido_id,
            aprobado=resumen["estatus_pedido"] == "pagado",
            estatus_pedido=resumen["estatus_pedido"],
            estado_pago=resumen["estado_pago"],
            mensaje=_mensaje_pago(resumen),
            total=resumen["total"],
        )

    @strawberry.mutation
    def conciliar_pago(
        self, info: Info, pedido_id: int, order_id: str
    ) -> ResultadoPagoType:
        """Reconsulta una orden verificada. Solo administradores."""
        requerir_admin(info)
        order_id = order_id.strip()
        if not order_id:
            raise ValueError("Debes proporcionar el ID de la orden.")

        try:
            orden = obtener_orden(order_id)
        except ErrorMercadoPago as error:
            print(f"[Conciliación] Pedido {pedido_id}, orden {order_id}: {error}")
            raise ValueError(
                "No se pudo consultar la orden en Mercado Pago."
            ) from error

        resumen = aplicar_orden(orden, pedido_esperado=pedido_id)
        if resumen is None:
            raise ValueError("La orden no corresponde a un pedido válido.")

        return ResultadoPagoType(
            pedido_id=resumen["pedido_id"],
            aprobado=resumen["estatus_pedido"] == "pagado",
            estatus_pedido=resumen["estatus_pedido"],
            estado_pago=resumen["estado_pago"],
            mensaje=_mensaje_pago(resumen),
            total=resumen["total"],
        )

    @strawberry.mutation
    def confirmar_sin_cobro(
        self, info: Info, intento_id: int, confirmacion: str
    ) -> bool:
        """Reversión excepcional de una reserva; exige verificación humana."""
        requerir_admin(info)
        if confirmacion != f"SIN COBRO {intento_id}":
            raise ValueError("La confirmación no coincide.")
        return liberar_reserva(intento_id, revision_admin=True)

    @strawberry.mutation
    def registrar_usuario(self, data: RegistroInput) -> UsuarioType:
        email = data.email.strip().lower()
        nombre = data.nombre.strip()
        if not email or not nombre or not data.password:
            raise ValueError("Debes indicar nombre, correo y contraseña.")
        with Session(engine) as session:
            existente = session.exec(
                select(UsuarioDB).where(UsuarioDB.email == email)
            ).first()
            if existente is not None:
                raise ValueError("Ya existe un usuario con ese correo.")
            nuevo = UsuarioDB(
                nombre=nombre,
                email=email,
                password_hash=hash_password(data.password),
                rol="cliente",
            )
            session.add(nuevo)
            session.commit()
            session.refresh(nuevo)
            resultado = usuario_a_type(nuevo)
        publicar("cliente_nuevo", f"Nuevo cliente registrado: {nombre}")
        return resultado

    @strawberry.mutation
    def login(self, data: LoginInput) -> AuthPayload:
        email = data.email.strip().lower()
        with Session(engine) as session:
            usuario = session.exec(
                select(UsuarioDB).where(UsuarioDB.email == email)
            ).first()
            if usuario is None or not usuario.password_hash:
                raise ValueError("Correo o contraseña incorrectos.")
            if not verify_password(data.password, usuario.password_hash):
                raise ValueError("Correo o contraseña incorrectos.")
            if not usuario.activo:
                raise ValueError("Usuario inactivo.")
            token = create_access_token(user_id=usuario.id, email=usuario.email)
            return AuthPayload(token=token, usuario=usuario_a_type(usuario))


@strawberry.type
class EventoBackoffice:
    """Aviso en tiempo real para el panel de administración."""

    tipo: str
    mensaje: str
    pedido_id: Optional[int]
    fecha: datetime


@strawberry.type
class Subscription:
    @strawberry.subscription
    async def eventos_backoffice(
        self, info: Info
    ) -> AsyncGenerator[EventoBackoffice, None]:
        # Solo administradores. El token llega en connection_params.
        requerir_admin(info)
        async for evento in suscribir():
            yield EventoBackoffice(**evento)


schema = strawberry.Schema(
    query=Query, mutation=Mutation, subscription=Subscription
)
