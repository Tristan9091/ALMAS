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
from payments import crear_preferencia, ErrorMercadoPago
from webhooks import procesar_pago_mp


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
                select(ProductoDB).where(ProductoDB.categoria_id == self.id)
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
            query = select(ProductoDB)
            if categoria_id is not None:
                query = query.where(ProductoDB.categoria_id == categoria_id)
            query = query.offset(offset).limit(limit)
            productos = session.exec(query).all()
            return [producto_a_type(p, session) for p in productos]

    @strawberry.field
    def product(self, id: int) -> Optional[ProductoType]:
        with Session(engine) as session:
            p = session.get(ProductoDB, id)
            if p is None:
                return None
            return producto_a_type(p, session)

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
    def pedidos(self) -> List[PedidoHistorialType]:
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

        return UsuarioType(
        id=usuario.id,
        nombre=usuario.nombre,
        email=usuario.email
        )

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


@strawberry.type
class PreferenciaPagoType:
    pago_id: int
    preference_id: str
    init_point: str


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


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_producto(self, data: ProductoInput) -> ProductoType:
        with Session(engine) as session:
            nuevo = ProductoDB(**data.__dict__)
            session.add(nuevo)
            session.commit()
            session.refresh(nuevo)
            return producto_a_type(nuevo, session)

    @strawberry.mutation
    def actualizar_stock(self, id: int, nuevo_stock: int) -> Optional[ProductoType]:
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
    def eliminar_producto(self, id: int) -> bool:
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
                if producto is None:
                    raise ValueError(f"El producto {d.producto_id} ya no existe.")

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
    def crear_preferencia_pago(self, info: Info, pedido_id: int) -> PreferenciaPagoType:
        """
        Inicia el cobro de un pedido con Mercado Pago Checkout Pro.

        Regresa el init_point: el link al que el frontend debe mandar
        al comprador para que pague.
        """
        usuario = obtener_usuario_actual(info)

        with Session(engine) as session:
            pedido = session.get(PedidoDB, pedido_id)

            # Mismo mensaje en ambos casos para no revelar pedidos ajenos.
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")

            if pedido.estatus != "pendiente":
                raise ValueError("Este pedido ya no está pendiente de pago.")

            ya_aprobado = session.exec(
                select(PagoDB).where(
                    PagoDB.pedido_id == pedido.id,
                    PagoDB.estado == "approved",
                )
            ).first()
            if ya_aprobado:
                raise ValueError("Este pedido ya fue pagado.")

            detalles = session.exec(
                select(DetallePedidoDB).where(DetallePedidoDB.pedido_id == pedido.id)
            ).all()
            if not detalles:
                raise ValueError("El pedido no tiene productos.")

            items = []
            for d in detalles:
                producto = session.get(ProductoDB, d.producto_id)
                if producto is None:
                    raise ValueError("Uno de los productos del pedido ya no existe.")
                if d.cantidad > producto.stock:
                    raise ValueError(f"Ya no hay stock suficiente de {producto.nombre}.")

                titulo = producto.nombre
                if d.variante_id is not None:
                    variante = session.get(VarianteDB, d.variante_id)
                    if variante:
                        titulo = f"{producto.nombre} ({variante.tipo} {variante.valor})"

                items.append({
                    "id": producto.id,
                    "title": titulo,
                    "quantity": d.cantidad,
                    "unit_price": d.precio_unitario,
                })

            try:
                preferencia = crear_preferencia(
                    pedido_id=pedido.id,
                    items=items,
                    email_comprador=pedido.email_comprador,
                )
            except ErrorMercadoPago as error:
                # El detalle técnico queda en la consola del servidor;
                # al cliente solo le llega un mensaje general.
                print(f"[Mercado Pago] Pedido {pedido.id}: {error}")
                raise ValueError(
                    "No se pudo iniciar el pago con Mercado Pago. Intenta de nuevo."
                )

            pago = PagoDB(
                pedido_id=pedido.id,
                proveedor="mercadopago",
                preference_id=preferencia["id"],
                monto=pedido.total,
                moneda="MXN",
                estado="creado",
            )
            session.add(pago)
            session.commit()
            session.refresh(pago)

            return PreferenciaPagoType(
                pago_id=pago.id,
                preference_id=preferencia["id"],
                init_point=preferencia["init_point"],
            )

    @strawberry.mutation
    def sincronizar_pago(self, info: Info, pedido_id: int, payment_id: str) -> EstadoPagoType:
        """
        Verifica un pago con Mercado Pago cuando el comprador regresa a la tienda.

        El payment_id llega en la URL de retorno, pero no se confía en ella:
        el estado real se consulta a Mercado Pago. Sirve en local, donde
        los webhooks no pueden llegar, y como respaldo si un webhook se retrasa.
        """
        usuario = obtener_usuario_actual(info)

        with Session(engine) as session:
            pedido = session.get(PedidoDB, pedido_id)
            if pedido is None or pedido.usuario_id != usuario.id:
                raise ValueError("Pedido no encontrado.")

        try:
            resumen = procesar_pago_mp(payment_id, pedido_esperado=pedido_id)
        except ErrorMercadoPago as error:
            print(f"[Mercado Pago] Pedido {pedido_id}: {error}")
            raise ValueError("No se pudo verificar el pago. Intenta de nuevo en unos minutos.")

        if resumen is None:
            raise ValueError("No se encontró información de este pago.")

        return EstadoPagoType(**resumen)

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
            )
        )

        session.add(usuario)
        session.commit()
        session.refresh(usuario)

        return UsuarioType(
            id=usuario.id,
            nombre=usuario.nombre,
            email=usuario.email
        )

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
            usuario=UsuarioType(
                id=usuario.id,
                nombre=usuario.nombre,
                email=usuario.email
            )
        )


schema = strawberry.Schema(query=Query, mutation=Mutation)