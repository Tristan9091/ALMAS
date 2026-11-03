
"""
Sincronizacion de productos entre PostgreSQL y MongoDB.

PostgreSQL es la fuente principal de los productos.
MongoDB almacena los datos descriptivos y sus atributos.
"""

from sqlmodel import Session, select

from database import engine, transaccion_pago
from models import Producto, SincronizacionProducto, ahora
from mongodb import obtener_base_mongo
from models import SincronizacionProducto



def sincronizar_producto(
    producto: Producto,
    version: int = 1,
) -> None:
    if producto.id is None:
        raise ValueError("El producto debe tener un ID.")

    coleccion = obtener_base_mongo()["productos"]

    # Preparar el documento si todavia no existe.
    coleccion.update_one(
        {"_id": producto.id},
        {
            "$setOnInsert": {
                "atributos": {
                    "material": None,
                    "piedras": [],
                    "color": None,
                },
                "version": 0,
            }
        },
        upsert=True,
    )

    # Actualizar solo documentos con una version anterior.
    # Tambien admite documentos antiguos sin version.
    coleccion.update_one(
        {
            "_id": producto.id,
            "$or": [
                {"version": {"$lt": version}},
                {"version": {"$exists": False}},
            ],
        },
        {
            "$set": {
                "nombre": producto.nombre,
                "descripcion": producto.descripcion,
                "imagen_url": producto.imagen_url,
                "version": version,
            }
        },
    )

    # Verificar que MongoDB tenga la version esperada
    # o una mas reciente.
    documento = coleccion.find_one(
        {"_id": producto.id},
        {"version": 1},
    )

    if documento is None:
        raise RuntimeError(
            "No se encontro el producto en MongoDB."
        )

    if documento.get("version", 0) < version:
        raise RuntimeError(
            "MongoDB no confirmo la version esperada."
        )


def sincronizar_catalogo() -> dict:
    """
    Recorre PostgreSQL y sincroniza todos sus productos
    con MongoDB, incluidos los desactivados.

    Continua con los demas productos si uno falla.
    """
    sincronizados = 0
    errores = []

    with Session(engine) as session:
        productos = session.exec(select(Producto)).all()

        for producto in productos:
            try:
                sincronizar_producto(producto)
                sincronizados += 1
            except Exception as error:
                errores.append({
                    "producto_id": producto.id,
                    "error": str(error),
                })

    return {
        "total": len(productos),
        "sincronizados": sincronizados,
        "errores": errores,
    }


def marcar_producto_pendiente(session: Session, producto_id: int) -> None:
    """
    Marca un producto para sincronizar.
    Debe ejecutarse en la misma transaccion de PostgreSQL
    que modifica el producto.
    """
    registro = session.get(SincronizacionProducto, producto_id)

    if registro is None:
        registro = SincronizacionProducto(
            producto_id=producto_id,
            pendiente=True,
        )
    else:
        registro.pendiente = True
        registro.version += 1
        registro.fecha_actualizacion = ahora()

    session.add(registro)



def procesar_sincronizaciones_pendientes() -> dict:
    sincronizados = 0
    errores = []

    with Session(engine) as session:
        ids = session.exec(
            select(SincronizacionProducto.producto_id).where(
                SincronizacionProducto.pendiente == True
            )
        ).all()

    for producto_id in ids:
        try:
            # Leer una version consistente del producto.
            with Session(engine) as session:
                registro = session.get(
                    SincronizacionProducto, producto_id
                )
                producto = session.get(Producto, producto_id)

                if registro is None or not registro.pendiente:
                    continue

                if producto is None:
                    raise ValueError("Producto no encontrado.")

                version = registro.version

                datos = Producto(
                    id=producto.id,
                    nombre=producto.nombre,
                    descripcion=producto.descripcion,
                    precio=producto.precio,
                    imagen_url=producto.imagen_url,
                    stock=producto.stock,
                    categoria_id=producto.categoria_id,
                    activo=producto.activo,
                )

            # MongoDB se actualiza fuera de la transaccion SQL.
            sincronizar_producto(datos, version)

            # Solo confirmar si no hubo otra edicion.
            with transaccion_pago() as session:
                registro = session.get(
                    SincronizacionProducto, producto_id
                )

                if (
                    registro is not None
                    and registro.pendiente
                    and registro.version == version
                ):
                    registro.pendiente = False
                    session.add(registro)

            sincronizados += 1

        except Exception as error:
            errores.append({
                "producto_id": producto_id,
                "error": str(error),
            })

    return {
        "sincronizados": sincronizados,
        "errores": errores,
    }

if __name__ == "__main__":
    resultado = sincronizar_catalogo()

    print(f"Productos encontrados: {resultado['total']}")
    print(f"Productos sincronizados: {resultado['sincronizados']}")
    print(f"Errores: {len(resultado['errores'])}")

    for error in resultado["errores"]:
        print(
            f"Producto {error['producto_id']}: "
            f"{error['error']}"
        )
