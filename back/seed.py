
from sqlmodel import Session
from database import engine, crear_tablas
from models import Categoria, Producto, Variante

def seed():
    crear_tablas()
    with Session(engine) as session:
        anillos = Categoria(nombre="Anillos", imagen_url="https://www.melissagutierrez.com.mx/cdn/shop/files/ArgollasOroRosa4y2mmPlanasCepilladas01.jpg?v=1724103635")
        collares = Categoria(nombre="Collares", imagen_url="https://lumai.com.mx/cdn/shop/files/Screenshot2026-08-28at7.33.19PM.png?v=1788194336")
        aretes = Categoria(nombre="Aretes", imagen_url="https://swarovskimexico.vtexassets.com/arquivos/ids/208736-800-auto?v=638697110410730000&width=800&height=auto&aspect=true")
        session.add_all([anillos, collares, aretes])
        session.commit()
        session.refresh(anillos)
        session.refresh(collares)
        session.refresh(aretes)

        p1 = Producto(
            nombre="Anillo de Oro",
            descripcion="Anillo artesanal bañado en oro",
            precio=899.0,
            imagen_url="https://i.etsystatic.com/10797896/r/il/d68c69/3676765048/il_570xN.3676765048_gwhf.jpg",
            stock=10,
            categoria_id=anillos.id,
        )
        p2 = Producto(
            nombre="Anillo de Plata con Cuarzo",
            descripcion="Anillo artesanal de plata .925 con cuarzo rosa",
            precio=550.0,
            imagen_url="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR9gG51Kqo7PTc-SiMAz6FAGa9CS1kD7s2wbWULeVkhHIB2EItwmJniakZ5&s=10",
            stock=12,
            categoria_id=anillos.id,
        )
        p3 = Producto(
            nombre="Collar de Plata",
            descripcion="Collar artesanal de plata .925",
            precio=650.0,
            imagen_url="https://cdn-media.glamira.com/media/product/newgeneration/view/1/sku/14976edand/diamond/diamond-zirconia_AAAAA/alloycolour/white.jpg",
            stock=8,
            categoria_id=collares.id,
        )
        p4 = Producto(
            nombre="Collar de Oro con Dije",
            descripcion="Collar bañado en oro con dije de luna",
            precio=780.0,
            imagen_url="https://i.etsystatic.com/27972495/r/il/68870a/3257987378/il_570xN.3257987378_gqok.jpg",
            stock=6,
            categoria_id=collares.id,
        )
        p5 = Producto(
            nombre="Aretes de Perla",
            descripcion="Aretes con perla cultivada",
            precio=420.0,
            imagen_url="https://cdn.onecklace.com/products/2733/product_2733_1_730.jpeg",
            stock=15,
            categoria_id=aretes.id,
        )
        p6 = Producto(
            nombre="Aretes Colgantes de Oro",
            descripcion="Aretes largos bañados en oro",
            precio=510.0,
            imagen_url="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRenNCaokM6ANrY34m9GPSOnlvOgr8futsz6hZN1LcZFQ&s",
            stock=9,
            categoria_id=aretes.id,
        )

        productos = [p1, p2, p3, p4, p5, p6]
        session.add_all(productos)
        session.commit()
        for p in productos:
            session.refresh(p)

        variantes = [
            Variante(tipo="talla", valor="6", producto_id=p1.id),
            Variante(tipo="talla", valor="7", producto_id=p1.id),
            Variante(tipo="talla", valor="8", producto_id=p1.id),
            Variante(tipo="talla", valor="7", producto_id=p2.id),
            Variante(tipo="talla", valor="8", producto_id=p2.id),
        ]
        session.add_all(variantes)
        session.commit()

        print("Datos de prueba insertados correctamente.")

if __name__ == "__main__":
    seed()