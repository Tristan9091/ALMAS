import os
import resend
from html import escape
from sqlmodel import Session, select

from database import engine
from models import Pedido, DetallePedido, Producto

from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")


def enviar_correo_prueba(destinatario: str):
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY no configurada")

    remitente = os.getenv(
        "RESEND_FROM_EMAIL",
        "ALMAS <onboarding@resend.dev>"
    )

    resultado = resend.Emails.send({
        "from": remitente,
        "to": [destinatario],
        "subject": "Prueba de correo - ALMAS",
        "html": """
            <div style="font-family: Arial, sans-serif;">
                <h1>ALMAS Joyería</h1>
                <p>¡La integración con Resend funciona!</p>
                <p>Este correo fue enviado desde nuestro backend FastAPI.</p>
            </div>
        """
    })

    return resultado

def enviar_confirmacion_compra(pedido_id: int, destinatario: str):
    """
    Envia un correo con los detalles de un pedido pagado.
    No modifica pagos, pedidos ni inventario.
    """

    with Session(engine) as session:
        pedido = session.get(Pedido, pedido_id)

        if pedido is None:
            raise ValueError("El pedido no existe.")

        if pedido.estatus not in {
            "pagado",
            "en_preparacion",
            "enviado",
            "entregado",
        }:
            raise ValueError("El pedido no tiene un pago confirmado.")

        detalles = session.exec(
            select(DetallePedido).where(
                DetallePedido.pedido_id == pedido_id
            )
        ).all()

        filas = ""

        for detalle in detalles:
            producto = session.get(Producto, detalle.producto_id)

            nombre = (
                producto.nombre
                if producto
                else f"Producto #{detalle.producto_id}"
            )

            subtotal = detalle.cantidad * detalle.precio_unitario

            filas += f"""
                <tr>
                    <td>{escape(nombre)}</td>
                    <td>{detalle.cantidad}</td>
                    <td>${subtotal:,.2f} MXN</td>
                </tr>
            """

        nombre_cliente = escape(pedido.nombre_comprador)

        html = f"""
        <div style="font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: auto;
                    color: #333;">

            <h1 style="color: #8b1262;">
                ALMĀS Joyería
            </h1>

            <h2>¡Gracias por tu compra!</h2>

            <p>Hola, {nombre_cliente}.</p>

            <p>
                Hemos confirmado el pago de tu pedido.
                Ya estamos preparando tus joyas.
            </p>

            <h3>Pedido #{pedido.id}</h3>

            <table style="width: 100%;
                          border-collapse: collapse;"
                   border="1" cellpadding="10">
                <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Subtotal</th>
                </tr>
                {filas}
            </table>

            <h2>Total: ${pedido.total:,.2f} MXN</h2>

            <p>Estado del pedido: Pago confirmado</p>

            <hr>

            <p>
                Gracias por confiar en ALMĀS.
            </p>
        </div>
        """

    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY no configurada.")

    return resend.Emails.send({
        "from": os.getenv(
            "RESEND_FROM_EMAIL",
            "ALMAS <onboarding@resend.dev>"
        ),
        "to": [destinatario],
        "subject": f"Confirmacion de compra - ALMAS #{pedido_id}",
        "html": html,
    })