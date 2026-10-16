from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime, timezone


def ahora() -> datetime:
    """Fecha y hora actual en UTC (sin zona, igual que el resto de la base)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
    # False = producto desactivado: no aparece en la tienda, pero se
    # conserva para no romper el historial de pedidos que lo incluyen.
    activo: bool = True

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
    # Estado del negocio: pendiente -> pagado -> enviado (o cancelado).
    # El estado del cobro vive en la tabla Pago.
    estatus: str = "pendiente"
    total: float
    fecha: datetime = Field(default_factory=datetime.utcnow)
    usuario_id: Optional[int] = Field(default=None, foreign_key="usuario.id")

    usuario: Optional["Usuario"] = Relationship(back_populates="pedidos")
    detalles: List["DetallePedido"] = Relationship(back_populates="pedido")
    pagos: List["Pago"] = Relationship(back_populates="pedido")


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

    # "cliente" o "admin". El registro público siempre asigna "cliente";
    # un admin solo se crea con el script crear_admin.py.
    rol: str = "cliente"

    pedidos: List["Pedido"] = Relationship(back_populates="usuario")


class Pago(SQLModel, table=True):
    # intento de cobro
    id: Optional[int] = Field(default=None, primary_key=True)
    pedido_id: int = Field(foreign_key="pedido.id", index=True)

    proveedor: str = "mercadopago"
    preference_id: Optional[str] = Field(default=None, index=True)
    # ID de la orden en Checkout API (ej. "ORD01..."). Una orden por intento.
    order_id: Optional[str] = Field(default=None, index=True)
    payment_id: Optional[str] = Field(default=None, index=True, unique=True)

    monto: float
    moneda: str = "MXN"

    estado: str = "creado"
    estado_detalle: Optional[str] = None

    # True cuando ya se descontó el inventario por este pago.
    inventario_aplicado: bool = False

    fecha_creacion: datetime = Field(default_factory=ahora)
    fecha_actualizacion: datetime = Field(default_factory=ahora)

    pedido: Optional[Pedido] = Relationship(back_populates="pagos")