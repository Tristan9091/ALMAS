
from typing import Optional

from mcp.server.fastmcp import FastMCP
from sqlmodel import Session, select
from sqlalchemy import or_

from database import engine
from models import Producto, Categoria


# Servidor MCP de herramientas para el asesor de ALMAS
mcp = FastMCP("ALMAS Catalogo")


@mcp.tool()
def listar_categorias() -> list[dict]:
    """
    Lista las categorias disponibles en ALMAS.
    Usar cuando el cliente quiera explorar tipos de joyas.
    """
    with Session(engine) as session:
        categorias = session.exec(
            select(Categoria).order_by(Categoria.nombre)
        ).all()

        return [
            {
                "id": categoria.id,
                "nombre": categoria.nombre,
            }
            for categoria in categorias
        ]


@mcp.tool()
def buscar_productos(
    buscar: Optional[str] = None,
    categoria_id: Optional[int] = None,
    precio_min: Optional[float] = None,
    precio_max: Optional[float] = None,
    solo_disponibles: bool = True,
    limite: int = 10,
) -> list[dict]:
    """
    Busca productos reales en ALMAS.

    Permite filtrar por nombre, descripcion, categoria,
    precio y disponibilidad.

    Los precios estan expresados en pesos mexicanos (MXN).
    """
    limite = max(1, min(limite, 20))

    if precio_min is not None and precio_min < 0:
        return [{"error": "El precio minimo no puede ser negativo"}]

    if precio_max is not None and precio_max < 0:
        return [{"error": "El precio maximo no puede ser negativo"}]

    if (
        precio_min is not None
        and precio_max is not None
        and precio_min > precio_max
    ):
        return [{"error": "El precio minimo supera al maximo"}]

    with Session(engine) as session:
        consulta = select(Producto).where(
            Producto.activo == True
        )

        if buscar and buscar.strip():
            termino = buscar.strip()[:100]

            consulta = consulta.where(
                or_(
                    Producto.nombre.ilike(f"%{termino}%"),
                    Producto.descripcion.ilike(f"%{termino}%"),
                )
            )

        if categoria_id is not None:
            consulta = consulta.where(
                Producto.categoria_id == categoria_id
            )

        if precio_min is not None:
            consulta = consulta.where(
                Producto.precio >= precio_min
            )

        if precio_max is not None:
            consulta = consulta.where(
                Producto.precio <= precio_max
            )

        if solo_disponibles:
            consulta = consulta.where(
                Producto.stock > 0
            )

        consulta = consulta.order_by(
            Producto.precio.asc(),
            Producto.id.asc()
        ).limit(limite)

        productos = session.exec(consulta).all()

        return [
            {
                "id": producto.id,
                "nombre": producto.nombre,
                "descripcion": producto.descripcion,
                "precio": producto.precio,
                "moneda": "MXN",
                "stock": producto.stock,
                "disponible": producto.stock > 0,
                "categoria_id": producto.categoria_id,
                "imagen_url": producto.imagen_url,
                "url": f"/producto/{producto.id}",
            }
            for producto in productos
        ]


@mcp.tool()
def obtener_producto(producto_id: int) -> dict:
    """
    Obtiene los detalles de un producto por su ID.
    Solo permite consultar productos activos.
    """
    with Session(engine) as session:
        producto = session.get(Producto, producto_id)

        if not producto or not producto.activo:
            return {
                "error": "Producto no encontrado"
            }

        categoria = session.get(
            Categoria,
            producto.categoria_id
        )

        return {
            "id": producto.id,
            "nombre": producto.nombre,
            "descripcion": producto.descripcion,
            "precio": producto.precio,
            "moneda": "MXN",
            "stock": producto.stock,
            "disponible": producto.stock > 0,
            "categoria": categoria.nombre if categoria else None,
            "imagen_url": producto.imagen_url,
            "url": f"/producto/{producto.id}",
        }


if __name__ == "__main__":
    mcp.run(transport="stdio")
