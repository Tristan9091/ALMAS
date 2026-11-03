
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

import sincronizacion_catalogo as catalogo
from models import (
    Categoria,
    Producto,
    SincronizacionProducto,
)




class ColeccionMongoFalsa:
    def __init__(self):
        self.documentos = {}
        self.fallar = False

    def coincide(self, documento, filtro):
        for campo, condicion in filtro.items():
            if campo == "$or":
                if not any(
                    self.coincide(documento, opcion)
                    for opcion in condicion
                ):
                    return False
                continue

            if isinstance(condicion, dict):
                if "$lt" in condicion:
                    if (
                        campo not in documento
                        or documento[campo] >= condicion["$lt"]
                    ):
                        return False

                if "$exists" in condicion:
                    if (
                        (campo in documento)
                        != condicion["$exists"]
                    ):
                        return False
            elif documento.get(campo) != condicion:
                return False

        return True

    def update_one(self, filtro, actualizacion, upsert=False):
        if self.fallar:
            raise ConnectionError("MongoDB no disponible")

        producto_id = filtro["_id"]
        documento = self.documentos.get(producto_id)

        if documento is None:
            if not upsert:
                return

            documento = {"_id": producto_id}
            documento.update(
                actualizacion.get("$setOnInsert", {})
            )
            documento.update(actualizacion.get("$set", {}))
            self.documentos[producto_id] = documento
            return

        if not self.coincide(documento, filtro):
            return

        documento.update(actualizacion.get("$set", {}))

    def find_one(self, filtro, proyeccion=None):
        if self.fallar:
            raise ConnectionError("MongoDB no disponible")

        documento = self.documentos.get(filtro["_id"])

        if documento is None:
            return None

        if not self.coincide(documento, filtro):
            return None

        if proyeccion is None:
            return documento.copy()

        resultado = {"_id": documento["_id"]}

        for campo, incluir in proyeccion.items():
            if incluir and campo in documento:
                resultado[campo] = documento[campo]

        return resultado

class TestSincronizacionCatalogo(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

        self.coleccion = ColeccionMongoFalsa()
        self.base_mongo = {"productos": self.coleccion}

        @contextmanager
        def transaccion_prueba():
            with Session(self.engine) as session:
                try:
                    yield session
                    session.commit()
                except Exception:
                    session.rollback()
                    raise

        self.parches = [
            patch.object(catalogo, "engine", self.engine),
            patch.object(
                catalogo,
                "transaccion_pago",
                transaccion_prueba,
            ),
            patch.object(
                catalogo,
                "obtener_base_mongo",
                return_value=self.base_mongo,
            ),
        ]

        for parche in self.parches:
            parche.start()

        with Session(self.engine) as session:
            categoria = Categoria(nombre="Joyeria")
            session.add(categoria)
            session.flush()

            producto = Producto(
                nombre="Anillo original",
                descripcion="Descripcion original",
                precio=500,
                imagen_url="https://example.com/anillo.jpg",
                stock=10,
                categoria_id=categoria.id,
            )
            session.add(producto)
            session.flush()

            self.producto_id = producto.id

            catalogo.marcar_producto_pendiente(
                session, self.producto_id
            )

            session.commit()

    
    def test_edicion_durante_sincronizacion(self):
        sincronizacion_original = catalogo.sincronizar_producto

        def sincronizar_con_edicion(producto, version=1):
            # Simular una edicion durante la sincronizacion.
            with Session(self.engine) as session:
                actual = session.get(Producto, self.producto_id)
                actual.nombre = "Anillo version nueva"
                session.add(actual)

                catalogo.marcar_producto_pendiente(
                    session, self.producto_id
                )
                session.commit()

            # Terminar la sincronizacion anterior.
            sincronizacion_original(producto, version)

        with patch.object(
            catalogo,
            "sincronizar_producto",
            side_effect=sincronizar_con_edicion,
        ):
            catalogo.procesar_sincronizaciones_pendientes()

        # La nueva version debe permanecer pendiente.
        self.assertTrue(self.esta_pendiente())

        # Sincronizar nuevamente, ahora sin la edicion simulada.
        resultado = (
            catalogo.procesar_sincronizaciones_pendientes()
        )

        documento = self.coleccion.documentos[self.producto_id]

        self.assertEqual(
            documento["nombre"],
            "Anillo version nueva",
        )
        self.assertEqual(documento["version"], 2)
        self.assertFalse(self.esta_pendiente())
        self.assertEqual(resultado["sincronizados"], 1)

    def tearDown(self):
        for parche in reversed(self.parches):
            parche.stop()

        self.engine.dispose()

    def esta_pendiente(self):
        with Session(self.engine) as session:
            registro = session.get(
                SincronizacionProducto,
                self.producto_id,
            )
            return registro.pendiente

    def test_crear_documento(self):
        resultado = (
            catalogo.procesar_sincronizaciones_pendientes()
        )

        documento = self.coleccion.documentos[self.producto_id]

        self.assertEqual(resultado["sincronizados"], 1)
        self.assertEqual(documento["nombre"], "Anillo original")
        self.assertFalse(self.esta_pendiente())

    def test_actualizar_sin_perder_atributos(self):
        catalogo.procesar_sincronizaciones_pendientes()

        documento = self.coleccion.documentos[self.producto_id]
        documento["atributos"] = {
            "material": "Oro",
            "piedras": ["Diamante"],
            "color": "Dorado",
        }

        with Session(self.engine) as session:
            producto = session.get(Producto, self.producto_id)
            producto.nombre = "Anillo actualizado"
            session.add(producto)

            catalogo.marcar_producto_pendiente(
                session, self.producto_id
            )
            session.commit()

        catalogo.procesar_sincronizaciones_pendientes()

        documento = self.coleccion.documentos[self.producto_id]

        self.assertEqual(
            documento["nombre"], "Anillo actualizado"
        )
        self.assertEqual(
            documento["atributos"]["material"], "Oro"
        )
        self.assertEqual(
            documento["atributos"]["piedras"], ["Diamante"]
        )
        self.assertFalse(self.esta_pendiente())

    def test_reintentar_si_mongodb_falla(self):
        self.coleccion.fallar = True

        resultado = (
            catalogo.procesar_sincronizaciones_pendientes()
        )

        self.assertEqual(resultado["sincronizados"], 0)
        self.assertEqual(len(resultado["errores"]), 1)
        self.assertTrue(self.esta_pendiente())

        self.coleccion.fallar = False

        resultado = (
            catalogo.procesar_sincronizaciones_pendientes()
        )

        self.assertEqual(resultado["sincronizados"], 1)
        self.assertEqual(resultado["errores"], [])
        self.assertFalse(self.esta_pendiente())

    
    def test_version_antigua_no_sobrescribe_nueva(self):
        with Session(self.engine) as session:
            producto = session.get(Producto, self.producto_id)

            catalogo.sincronizar_producto(
                producto,
                version=2,
            )

            documento = self.coleccion.documentos[self.producto_id]
            self.assertEqual(documento["version"], 2)

            # Simular una escritura atrasada de otro worker.
            catalogo.sincronizar_producto(
                producto,
                version=1,
            )

            documento = self.coleccion.documentos[self.producto_id]

            self.assertEqual(documento["version"], 2)
            self.assertEqual(
                documento["nombre"],
                "Anillo original",
            )

    
    def test_documento_antiguo_sin_version(self):
        # Simular un producto que ya existe en MongoDB.
        self.coleccion.documentos[self.producto_id] = {
            "_id": self.producto_id,
            "nombre": "Nombre antiguo",
            "descripcion": "Descripcion antigua",
            "imagen_url": "https://example.com/antigua.jpg",
            "atributos": {
                "material": "Plata",
                "piedras": ["Zafiro"],
                "color": "Plateado",
            },
        }

        resultado = (
            catalogo.procesar_sincronizaciones_pendientes()
        )

        documento = self.coleccion.documentos[self.producto_id]

        self.assertEqual(resultado["sincronizados"], 1)
        self.assertEqual(resultado["errores"], [])
        self.assertEqual(documento["version"], 1)
        self.assertEqual(documento["nombre"], "Anillo original")

        # Los atributos existentes deben conservarse.
        self.assertEqual(
            documento["atributos"]["material"], "Plata"
        )
        self.assertEqual(
            documento["atributos"]["piedras"], ["Zafiro"]
        )
        self.assertEqual(
            documento["atributos"]["color"], "Plateado"
        )
        self.assertFalse(self.esta_pendiente())

    
    def test_catalogo_prioriza_postgresql(self):
        from schema import producto_a_type

        # MongoDB tiene informacion desactualizada.
        self.coleccion.documentos[self.producto_id] = {
            "_id": self.producto_id,
            "nombre": "Nombre antiguo",
            "descripcion": "Descripcion antigua",
            "imagen_url": "https://example.com/antigua.jpg",
            "atributos": {
                "material": "Oro",
                "piedras": ["Diamante"],
                "color": "Dorado",
            },
        }

        with patch(
            "schema.obtener_base_mongo",
            return_value=self.base_mongo,
        ):
            with Session(self.engine) as session:
                producto = session.get(
                    Producto,
                    self.producto_id,
                )

                resultado = producto_a_type(producto, session)

        # Los datos principales deben venir de PostgreSQL.
        self.assertEqual(resultado.nombre, "Anillo original")
        self.assertEqual(
            resultado.descripcion,
            "Descripcion original",
        )
        self.assertEqual(
            resultado.imagen_url,
            "https://example.com/anillo.jpg",
        )

        # Los atributos deben venir de MongoDB.
        self.assertEqual(resultado.material, "Oro")
        self.assertEqual(resultado.piedras, ["Diamante"])
        self.assertEqual(resultado.color, "Dorado")


    def test_catalogo_funciona_sin_mongodb(self):
        from schema import producto_a_type

        # Simular que MongoDB no esta disponible.
        self.coleccion.fallar = True

        with patch(
            "schema.obtener_base_mongo",
            return_value=self.base_mongo,
        ):
            with Session(self.engine) as session:
                producto = session.get(
                    Producto,
                    self.producto_id,
                )

                resultado = producto_a_type(producto, session)

        # PostgreSQL debe seguir proporcionando los datos.
        self.assertEqual(resultado.nombre, "Anillo original")
        self.assertEqual(resultado.precio, 500)
        self.assertEqual(resultado.stock, 10)

        # Sin MongoDB, los atributos quedan vacios.
        self.assertIsNone(resultado.material)
        self.assertEqual(resultado.piedras, [])
        self.assertIsNone(resultado.color)


    def test_ediciones_incrementan_version(self):
        with Session(self.engine) as session:
            registro = session.get(
                SincronizacionProducto,
                self.producto_id,
            )

            self.assertEqual(registro.version, 1)
            self.assertTrue(registro.pendiente)

            catalogo.marcar_producto_pendiente(
                session,
                self.producto_id,
            )
            session.commit()

        with Session(self.engine) as session:
            registro = session.get(
                SincronizacionProducto,
                self.producto_id,
            )

            self.assertEqual(registro.version, 2)
            self.assertTrue(registro.pendiente)

            catalogo.marcar_producto_pendiente(
                session,
                self.producto_id,
            )
            session.commit()

        with Session(self.engine) as session:
            registro = session.get(
                SincronizacionProducto,
                self.producto_id,
            )

            self.assertEqual(registro.version, 3)
            self.assertTrue(registro.pendiente)

if __name__ == "__main__":
    unittest.main()
