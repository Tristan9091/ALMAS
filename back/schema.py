import strawberry
from typing import List, Optional
from datetime import datetime
from sqlmodel import Session, select
from database import engine
from models import (
    Producto as ProductoDB,
    Categoria as CategoriaDB,
    Variante as VarianteDB,
    Pedido as PedidoDB,
    DetallePedido as DetallePedidoDB,
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
    precio_unitario: float


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
    def crear_pedido(self, data: PedidoInput) -> PedidoType:
        with Session(engine) as session:
            total = sum(d.cantidad * d.precio_unitario for d in data.detalles)

            pedido = PedidoDB(
                nombre_comprador=data.nombre_comprador,
                email_comprador=data.email_comprador,
                direccion_envio=data.direccion_envio,
                estatus="pendiente",
                total=total,
            )
            session.add(pedido)
            session.commit()
            session.refresh(pedido)

            for d in data.detalles:
                detalle = DetallePedidoDB(
                    pedido_id=pedido.id,
                    producto_id=d.producto_id,
                    variante_id=d.variante_id,
                    cantidad=d.cantidad,
                    precio_unitario=d.precio_unitario,
                )
                session.add(detalle)

                producto = session.get(ProductoDB, d.producto_id)
                if producto:
                    producto.stock = max(0, producto.stock - d.cantidad)
                    session.add(producto)

            session.commit()

            return PedidoType(
                id=pedido.id,
                nombre_comprador=pedido.nombre_comprador,
                estatus=pedido.estatus,
                total=pedido.total,
            )


schema = strawberry.Schema(query=Query, mutation=Mutation)