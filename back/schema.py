import strawberry
from typing import List, Optional
from datetime import datetime
from sqlmodel import Session, select
from database import engine
from strawberry.types import Info
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    get_token_from_header
)
from models import (
    Producto as ProductoDB,
    Categoria as CategoriaDB,
    Variante as VarianteDB,
    Pedido as PedidoDB,
    DetallePedido as DetallePedidoDB,
    Usuario as UsuarioDB,
    Pago as PagoDB,
)
from payments import crear_orden, ErrorMercadoPago
from webhooks import aplicar_orden
from panel import (
    ResumenAdminType,
    calcular_resumen,
    PedidoAdminType,
    PagoAdminType,
    ClienteAdminType,
    listar_pedidos,
    listar_pagos,
    listar_clientes,
    cancelar_pedido as cancelar_pedido_admin,
    cambiar_estado_cliente as cambiar_estado_cliente_admin,
)


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
        variantes=[VarianteType(id=v.id, tipo=v.tipo, valor=v.valor) for v in variantes],
        activo=p.activo,
    )


@strawberry.type
class CategoriaType:
    id: int
    nombre: str
    imagenUrl: Optional[str] = None

    @strawberry.field
    def productos(self) -> List["ProductoType"]:
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
class Query:
    @strawberry.field
    def products(self, categoria_id: Optional[int] = None, limit: int = 20, offset: int = 0) -> List[ProductoType]:
        with Session(engine) as session:
            # La tienda solo muestra productos activos.
            query = select(ProductoDB).where(ProductoDB.activo == True)  # noqa: E712
            if categoria_id is not None:
                query = query.where(ProductoDB.categoria_id == categoria_id)
            query = query.offset(offset).limit(limit)
            productos = session.exec(query).all()
            return [producto_a_type(p, session) for p in productos]

    @strawberry.field
    def product(self, id: int) -> Optional[ProductoType]:
        with Session(engine) as session:
            p = session.get(ProductoDB, id)
            if p is None or not p.activo:
                return None
            return producto_a_type(p, session)

    @strawberry.field
    def productos_admin(self, info: Info) -> List[ProductoType]:
        """Todos los productos, incluidos los desactivados. Solo admin."""
        requerir_admin(info)
        with Session(engine) as session:
            productos = session.exec(
                select(ProductoDB).order_by(ProductoDB.activo.desc(), ProductoDB.nombre)
            ).all()
            return [producto_a_type(p, session) for p in productos]

    @strawberry.field
    def categorias(self) -> List[CategoriaType]:
        with Session(engine) as session:
            cats = session.exec(select(CategoriaDB)).all()
            return [CategoriaType(id=c.id, nombre=c.nombre, imagenUrl=c.imagen_url) for c in cats]

    @strawberry.field
    def categoria(self, id: int) -> Optional[CategoriaType]:
        with Session(engine) as session:
            c = session.get(CategoriaDB, id)
            if c is None:
                return None
            return CategoriaType(id=c.id, nombre=c.nombre, imagenUrl=c.imagen_url)

    @strawberry.field
    def pedidos(self, info: Info) -> List[PedidoHistorialType]:
        # Lista de TODOS los pedidos de la tienda: solo para administradores.
        requerir_admin(info)
        with Session(engine) as session:
            peds = session.exec(select(PedidoDB)).all()
            return [
                PedidoHistorialType(id=p.id, nombre_comprador=p.nombre_comprador, estatus=p.estatus, total=p.total, fecha=p.fecha)
                for p in peds
            ]

    @strawberry.field
    def me(
        self,
        info: Info
    ) -> "UsuarioType":

        usuario = obtener_usuario_actual(info)

        return usuario_a_type(usuario)

    @strawberry.field
    def pedidos_admin(self, info: Info) -> List[PedidoAdminType]:
        """Todos los pedidos con sus productos y su último pago. Solo admin."""
        requerir_admin(info)
        return listar_pedidos()

    @strawberry.field
    def pagos_admin(self, info: Info) -> List[PagoAdminType]:
        """Todos los intentos de pago registrados. Solo admin."""
        requerir_admin(info)
        return listar_pagos()

    @strawberry.field
    def clientes_admin(self, info: Info) -> List[ClienteAdminType]:
        """Usuarios registrados, sin contraseñas. Solo admin."""
        requerir_admin(info)
        return listar_clientes()

    @strawberry.field
    def resumen_admin(self, info: Info, dias: int = 30) -> ResumenAdminType:
        """Datos del inicio del dashboard. Solo para administradores."""
        requerir_admin(info)
        return calcular_resumen(dias)

    @strawberry.field
    def estado_pedido(self, info: Info, pedido_id: int) -> "EstadoPagoType":
        """Estado actual de un pedido del usuario y de su último pago."""
        usuario = obtener_usuario_actual(info)

        with Session(engine) as session:
            pedido = session.get(PedidoDB, pedido_id)
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")

            ultimo_pago = session.exec(
                select(PagoDB)
                .where(PagoDB.pedido_id == pedido.id)
                .order_by(PagoDB.fecha_actualizacion.desc(), PagoDB.id.desc())
            ).first()

            return EstadoPagoType(
                pedido_id=pedido.id,
                estatus_pedido=pedido.estatus,
                estado_pago=ultimo_pago.estado if ultimo_pago else None,
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
    # Se acepta para no romper el frontend, pero el backend lo ignora:
    # el precio real siempre se toma de la base de datos.
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
    """Lo que manda el formulario de Mercado Pago. Nunca incluye la tarjeta."""
    pedido_id: int
    token: str               # tarjeta convertida en token por Mercado Pago
    metodo_pago: str         # marca: "visa", "master", "debvisa"...
    tipo_pago: str           # "credit_card" o "debit_card"
    cuotas: int = 1
    email_pagador: str


@strawberry.type
class ResultadoPagoType:
    pedido_id: int
    aprobado: bool
    estatus_pedido: str
    estado_pago: str
    mensaje: str
    total: float


# Mensajes para el cliente según el motivo que da Mercado Pago.
MENSAJES_RECHAZO = {
    "card_insufficient_amount": "La tarjeta no tiene fondos suficientes.",
    "insufficient_amount": "La tarjeta no tiene fondos suficientes.",
    "bad_filled_card_data": "Revisa los datos de la tarjeta.",
    "bad_filled_security_code": "El código de seguridad no es correcto.",
    "bad_filled_date": "La fecha de vencimiento no es correcta.",
    "invalid_card_token": "Los datos de la tarjeta vencieron. Vuelve a escribirlos.",
    "rejected_by_issuer": "Tu banco rechazó el pago. Prueba con otra tarjeta.",
    "required_call_for_authorize": "Tu banco pide que autorices el pago por teléfono.",
    "card_disabled": "La tarjeta está deshabilitada. Prueba con otra.",
    "high_risk": "El pago fue rechazado por seguridad. Prueba con otra tarjeta.",
    "max_attempts_exceeded": "Se superaron los intentos permitidos. Prueba con otra tarjeta.",
    "amount_limit_exceeded": "El monto supera el límite de la tarjeta.",
    "invalid_installments": "Esa tarjeta no acepta ese número de meses.",
    "duplicated_payment": "Ya hiciste un pago igual hace un momento.",
}


def mensaje_resultado(estado: str, detalle: str | None) -> str:
    if estado == "approved":
        return "Tu pago fue aprobado. Ya estamos preparando tus joyas."
    if estado in ("in_process", "pending"):
        return "Tu pago está en revisión. Te avisaremos cuando Mercado Pago lo confirme."
    return MENSAJES_RECHAZO.get(detalle or "", "No se pudo completar el pago. Prueba con otra tarjeta.")


@strawberry.type
class EstadoPagoType:
    pedido_id: int
    # Estado del negocio: pendiente, pagado, enviado, reembolsado.
    estatus_pedido: str
    # Estado según Mercado Pago: approved, pending, rejected...
    estado_pago: Optional[str] = None
    total: float

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
    # Nunca incluye password_hash: ese dato no sale del backend.
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

def obtener_usuario_actual(
    info: Info
) -> UsuarioDB:

    request = info.context["request"]

    authorization = request.headers.get(
        "Authorization"
    )

    token = get_token_from_header(
        authorization
    )

    if not token:
        raise ValueError(
            "No autenticado."
        )

    payload = decode_access_token(token)

    if not payload:
        raise ValueError(
            "Token inválido o expirado."
        )

    user_id = payload.get("sub")

    if not user_id:
        raise ValueError(
            "Token inválido."
        )

    with Session(engine) as session:

        usuario = session.get(
            UsuarioDB,
            int(user_id)
        )

        if not usuario:
            raise ValueError(
                "Usuario no encontrado."
            )

        if not usuario.activo:
            raise ValueError(
                "Usuario inactivo."
            )

        return usuario


def requerir_admin(info: Info) -> UsuarioDB:
    """
    Permite continuar solo si quien hace la petición es administrador.

    El rol se lee de la base de datos en cada petición (no del token),
    así que quitarle el rol a alguien le quita el acceso de inmediato.
    """
    usuario = obtener_usuario_actual(info)

    if usuario.rol != "admin":
        raise ValueError("No tienes permiso para realizar esta acción.")

    return usuario


def validar_producto(data: ProductoInput, session: Session) -> dict:
    """Revisa los datos de un producto y regresa los valores limpios."""
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


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_producto(self, info: Info, data: ProductoInput) -> ProductoType:
        requerir_admin(info)
        with Session(engine) as session:
            valores = validar_producto(data, session)
            nuevo = ProductoDB(**valores)
            session.add(nuevo)
            session.commit()
            session.refresh(nuevo)
            return producto_a_type(nuevo, session)

    @strawberry.mutation
    def actualizar_producto(self, info: Info, id: int, data: ProductoInput) -> ProductoType:
        requerir_admin(info)
        with Session(engine) as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                raise ValueError("El producto no existe.")
            for campo, valor in validar_producto(data, session).items():
                setattr(producto, campo, valor)
            session.add(producto)
            session.commit()
            session.refresh(producto)
            return producto_a_type(producto, session)

    @strawberry.mutation
    def cancelar_pedido(self, info: Info, id: int) -> PedidoAdminType:
        requerir_admin(info)
        return cancelar_pedido_admin(id)

    @strawberry.mutation
    def cambiar_estado_cliente(self, info: Info, id: int, activo: bool) -> ClienteAdminType:
        admin = requerir_admin(info)
        return cambiar_estado_cliente_admin(id, activo, admin.id)

    @strawberry.mutation
    def cambiar_estado_producto(self, info: Info, id: int, activo: bool) -> ProductoType:
        """
        Desactivar en lugar de borrar: el producto deja de verse en la tienda,
        pero los pedidos que ya lo incluyen conservan su información.
        """
        requerir_admin(info)
        with Session(engine) as session:
            producto = session.get(ProductoDB, id)
            if producto is None:
                raise ValueError("El producto no existe.")
            producto.activo = activo
            session.add(producto)
            session.commit()
            session.refresh(producto)
            return producto_a_type(producto, session)

    @strawberry.mutation
    def actualizar_stock(self, info: Info, id: int, nuevo_stock: int) -> Optional[ProductoType]:
        requerir_admin(info)
        if nuevo_stock < 0:
            raise ValueError("El stock no puede ser negativo.")
        with Session(engine) as session:
            p = session.get(ProductoDB, id)
            if p is None:
                return None
            p.stock = nuevo_stock
            session.add(p)
            session.commit()
            session.refresh(p)
            return producto_a_type(p, session)

    @strawberry.mutation
    def eliminar_producto(self, info: Info, id: int) -> bool:
        requerir_admin(info)
        with Session(engine) as session:
            p = session.get(ProductoDB, id)
            if p is None:
                return False
            session.delete(p)
            session.commit()
            return True

    @strawberry.mutation
    def crear_pedido(self, info: Info, data: PedidoInput) -> PedidoType:
        """
        Crea un pedido pendiente de pago.

        Los precios y el stock se consultan en la base de datos; los valores
        que manda el navegador no se usan. El inventario NO se descuenta aquí:
        se descontará cuando Mercado Pago confirme que el pago fue aprobado.
        """
        usuario = obtener_usuario_actual(info)

        if not data.detalles:
            raise ValueError("El pedido no tiene productos.")

        with Session(engine) as session:
            renglones = []
            cantidad_por_producto: dict[int, int] = {}

            for d in data.detalles:
                if d.cantidad <= 0:
                    raise ValueError("Las cantidades deben ser mayores a cero.")

                producto = session.get(ProductoDB, d.producto_id)
                if producto is None or not producto.activo:
                    raise ValueError(f"El producto {d.producto_id} ya no está disponible.")

                if d.variante_id is not None:
                    variante = session.get(VarianteDB, d.variante_id)
                    if variante is None or variante.producto_id != producto.id:
                        raise ValueError(
                            f"La variante elegida no corresponde a {producto.nombre}."
                        )

                # Varias variantes del mismo producto comparten el stock.
                cantidad_por_producto[producto.id] = (
                    cantidad_por_producto.get(producto.id, 0) + d.cantidad
                )
                if cantidad_por_producto[producto.id] > producto.stock:
                    raise ValueError(
                        f"Solo quedan {producto.stock} piezas de {producto.nombre}."
                    )

                renglones.append((d, float(producto.precio)))

            total = round(sum(d.cantidad * precio for d, precio in renglones), 2)

            pedido = PedidoDB(
                nombre_comprador=data.nombre_comprador,
                email_comprador=data.email_comprador,
                direccion_envio=data.direccion_envio,
                estatus="pendiente",
                total=total,
                usuario_id=usuario.id,
            )
            session.add(pedido)
            session.commit()
            session.refresh(pedido)

            for d, precio in renglones:
                session.add(DetallePedidoDB(
                    pedido_id=pedido.id,
                    producto_id=d.producto_id,
                    variante_id=d.variante_id,
                    cantidad=d.cantidad,
                    precio_unitario=precio,
                ))

            session.commit()

            return PedidoType(
                id=pedido.id,
                nombre_comprador=pedido.nombre_comprador,
                estatus=pedido.estatus,
                total=pedido.total,
            )

    @strawberry.mutation
    def pagar_pedido(self, info: Info, data: PagoTarjetaInput) -> ResultadoPagoType:
        """
        Cobra un pedido con tarjeta (Checkout API vía Orders).

        El total sale del pedido guardado en la base; el navegador solo
        manda el token de la tarjeta. Mercado Pago responde al momento.
        """
        usuario = obtener_usuario_actual(info)

        with Session(engine) as session:
            pedido = session.get(PedidoDB, data.pedido_id)

            # Mismo mensaje en ambos casos para no revelar pedidos ajenos.
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")
            if pedido.estatus != "pendiente":
                raise ValueError("Este pedido ya no está pendiente de pago.")

            detalles = session.exec(
                select(DetallePedidoDB).where(DetallePedidoDB.pedido_id == pedido.id)
            ).all()
            if not detalles:
                raise ValueError("El pedido no tiene productos.")
            for d in detalles:
                producto = session.get(ProductoDB, d.producto_id)
                if producto is None or not producto.activo:
                    raise ValueError("Uno de los productos del pedido ya no está disponible.")
                if d.cantidad > producto.stock:
                    raise ValueError(f"Ya no hay stock suficiente de {producto.nombre}.")

            # Si un cobro anterior sigue en revisión, no se permite otro:
            # podrían aprobarse los dos y cobrarle doble al cliente.
            en_revision = session.exec(
                select(PagoDB).where(
                    PagoDB.pedido_id == pedido.id,
                    PagoDB.estado.in_(["in_process", "pending"]),
                )
            ).first()
            if en_revision:
                raise ValueError(
                    "Ya hay un pago de este pedido en revisión. Espera la confirmación de Mercado Pago."
                )

            pedido_id, total = pedido.id, pedido.total

        if data.tipo_pago not in ("credit_card", "debit_card"):
            raise ValueError("Solo se aceptan tarjetas de crédito o débito.")
        if not data.token.strip():
            raise ValueError("Faltan los datos de la tarjeta.")

        try:
            orden = crear_orden(
                pedido_id=pedido_id,
                monto=total,
                token=data.token.strip(),
                metodo_pago=data.metodo_pago,
                tipo_pago=data.tipo_pago,
                cuotas=max(1, data.cuotas),
                email_pagador=data.email_pagador,
            )
        except ErrorMercadoPago as error:
            # El detalle técnico queda en la consola del servidor;
            # al cliente solo le llega un mensaje general.
            print(f"[Mercado Pago] Pedido {pedido_id}: {error}")
            raise ValueError("No se pudo procesar el pago con Mercado Pago. Intenta de nuevo.")

        resumen = aplicar_orden(orden, pedido_esperado=pedido_id)
        if resumen is None:
            raise ValueError("No se pudo registrar el resultado del pago.")

        return ResultadoPagoType(
            pedido_id=pedido_id,
            aprobado=resumen["estatus_pedido"] == "pagado",
            estatus_pedido=resumen["estatus_pedido"],
            estado_pago=resumen["estado_pago"],
            mensaje=mensaje_resultado(resumen["estado_pago"], resumen["estado_detalle"]),
            total=resumen["total"],
        )

    @strawberry.mutation
    def registrar_usuario(
        self,
        data: RegistroInput
        ) -> UsuarioType:

        with Session(engine) as session:

            usuario_existente = session.exec(
                select(UsuarioDB).where(
                    UsuarioDB.email == data.email
                )
            ).first()

        if usuario_existente:
            raise ValueError(
                "Ya existe un usuario con ese correo."
            )

        usuario = UsuarioDB(
            nombre=data.nombre,
            email=data.email,
            password_hash=hash_password(
                data.password
            ),
            # El registro público SIEMPRE crea clientes. RegistroInput no
            # tiene campo "rol", así que nadie puede pedir ser admin.
            rol="cliente",
        )

        session.add(usuario)
        session.commit()
        session.refresh(usuario)

        return usuario_a_type(usuario)

    @strawberry.mutation
    def login(
        self,
        data: LoginInput
    ) -> AuthPayload:

        with Session(engine) as session:
            usuario = session.exec(
            select(UsuarioDB).where(
                UsuarioDB.email == data.email
            )
        ).first()

        if not usuario:
            raise ValueError(
                "Correo o contraseña incorrectos."
            )

        if not usuario.password_hash:
            raise ValueError(
                "Correo o contraseña incorrectos."
            )

        if not verify_password(
            data.password,
            usuario.password_hash
        ):
            raise ValueError(
                "Correo o contraseña incorrectos."
            )

        if not usuario.activo:
            raise ValueError(
                "Usuario inactivo."
            )

        token = create_access_token(
            user_id=usuario.id,
            email=usuario.email
        )

        return AuthPayload(
            token=token,
            usuario=usuario_a_type(usuario),
        )


schema = strawberry.Schema(query=Query, mutation=Mutation)