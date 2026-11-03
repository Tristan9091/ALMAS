
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

import webhooks
from models import Categoria, Producto, Pedido, DetallePedido, Pago


class TestInventarioPagos(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

        @contextmanager
        def transaccion_prueba():
            with Session(self.engine) as session:
                try:
                    yield session
                    session.commit()
                except Exception:
                    session.rollback()
                    raise

        self.parche_db = patch.object(
            webhooks, "transaccion_pago", transaccion_prueba
        )
        self.parche_eventos = patch.object(webhooks, "publicar")
        self.parche_db.start()
        self.parche_eventos.start()

    def tearDown(self):
        self.parche_db.stop()
        self.parche_eventos.stop()
        self.engine.dispose()

    def preparar_pedido(self, stocks, cantidades):
        with Session(self.engine) as session:
            categoria = Categoria(nombre="Prueba")
            session.add(categoria)
            session.flush()

            productos = []
            for i, stock in enumerate(stocks):
                producto = Producto(
                    nombre=f"Producto {i}",
                    descripcion="Prueba",
                    precio=100,
                    imagen_url="https://example.com/test.jpg",
                    stock=stock,
                    categoria_id=categoria.id,
                )
                session.add(producto)
                session.flush()
                productos.append(producto.id)

            pedido = Pedido(
                nombre_comprador="Prueba",
                email_comprador="prueba@example.com",
                direccion_envio="Direccion de prueba",
                total=sum(cantidades) * 100,
            )
            session.add(pedido)
            session.flush()

            for producto_id, cantidad in zip(productos, cantidades):
                session.add(DetallePedido(
                    pedido_id=pedido.id,
                    producto_id=producto_id,
                    cantidad=cantidad,
                    precio_unitario=100,
                ))

            pago = Pago(
                pedido_id=pedido.id,
                monto=pedido.total,
                estado="creado",
                inventario_aplicado=False,
            )
            session.add(pago)
            session.commit()
            session.refresh(pago)

            return pedido.id, pago.id, productos

    def aprobar(self, pedido_id, pago_id):
        return webhooks.aplicar_orden({
            "id": f"ORD{pago_id}",
            "external_reference": f"{pedido_id}_{pago_id}",
            "status": "processed",
            "currency_id": "MXN",
            "total_paid_amount": "300.00",
        })

    def stocks_actuales(self, ids):
        with Session(self.engine) as session:
            return [session.get(Producto, i).stock for i in ids]

    def test_varios_productos(self):
        pedido, pago, productos = self.preparar_pedido(
            [10, 8], [2, 1]
        )
        resultado = self.aprobar(pedido, pago)

        self.assertEqual(resultado["estatus_pedido"], "pagado")
        self.assertEqual(self.stocks_actuales(productos), [8, 7])

    def test_stock_insuficiente(self):
        pedido, pago, productos = self.preparar_pedido(
            [10, 0], [2, 1]
        )
        resultado = self.aprobar(pedido, pago)

        self.assertEqual(
            resultado["estatus_pedido"], "incidencia_stock"
        )
        self.assertEqual(self.stocks_actuales(productos), [10, 0])

    def test_webhook_duplicado(self):
        pedido, pago, productos = self.preparar_pedido(
            [10, 8], [2, 1]
        )

        self.aprobar(pedido, pago)
        self.aprobar(pedido, pago)

        self.assertEqual(self.stocks_actuales(productos), [8, 7])


if __name__ == "__main__":
    unittest.main()
