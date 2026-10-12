import os
import requests
from dotenv import load_dotenv

load_dotenv()

MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN")


def crear_preferencia_pago():
    if not MP_ACCESS_TOKEN:
        raise ValueError("Falta configurar MP_ACCESS_TOKEN")

    url = "https://api.mercadopago.com/checkout/preferences"

    headers = {
        "Authorization": f"Bearer {MP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    datos = {
        "items": [
            {
                "title": "Producto de prueba ALMAS",
                "quantity": 1,
                "currency_id": "MXN",
                "unit_price": 100.0
            }
        ]
    }

    respuesta = requests.post(
        url,
        json=datos,
        headers=headers,
        timeout=15
    )

    print("Código HTTP:", respuesta.status_code)
    print("Respuesta Mercado Pago:", respuesta.text)

    respuesta.raise_for_status()

    return respuesta.json()
