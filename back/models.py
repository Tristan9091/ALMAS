from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime


class Categoria(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    imagen_url: Optional[str] = None

    productos: List["Producto"] = Relationship(back_populates="categoria")

class Producto(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    descripcion: str
    precio: float
    imagen_url: str
    stock: int
    categoria_id: int = Field(foreign_key="categoria.id")

    categoria: Optional[Categoria] = Relationship(back_populates="productos")
    variantes: List["Variante"] = Relationship(back_populates="producto")


class Variante(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tipo: str   # ej. "talla", "grabado"
    valor: str  # ej. "7", "Amor eterno"
    producto_id: int = Field(foreign_key="producto.id")

    producto: Optional[Producto] = Relationship(back_populates="variantes")


class Pedido(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre_comprador: str
    email_comprador: str
    direccion_envio: str
    estatus: str = "pendiente"
    total: float
    fecha: datetime = Field(default_factory=datetime.utcnow)
    usuario_id: Optional[int] = Field(default=None, foreign_key="usuario.id")  # ← agrega esta línea

    usuario: Optional["Usuario"] = Relationship(back_populates="pedidos")  # ← agrega esta línea
    detalles: List["DetallePedido"] = Relationship(back_populates="pedido")

class DetallePedido(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cantidad: int
    precio_unitario: float
    pedido_id: int = Field(foreign_key="pedido.id")
    producto_id: int = Field(foreign_key="producto.id")
    variante_id: Optional[int] = Field(default=None, foreign_key="variante.id")

    pedido: Optional[Pedido] = Relationship(back_populates="detalles")

class Usuario(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    nombre: str
    email: str = Field(index=True, unique=True)
    password_hash: str

    activo: bool = True

    pedidos: List["Pedido"] = Relationship(back_populates="usuario")