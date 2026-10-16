"""
payments.py — Comunicación con Mercado Pago (Checkout API vía Orders).

Flujo:
  1. En el navegador, el formulario de Mercado Pago (Card Payment Brick)
     convierte la tarjeta en un "token" de un solo uso. Los datos de la
     tarjeta NUNCA llegan a este servidor.
  2. Este módulo crea la orden de cobro con ese token: POST /v1/orders.
  3. Mercado Pago responde al instante si se aprobó o se rechazó.

Este archivo solo habla con Mercado Pago; no toca la base de datos.

Variables de entorno (back/.env):
    MP_ACCESS_TOKEN            Access Token (credenciales de prueba).
    MP_WEBHOOK_SECRET          Clave secreta de Webhooks (para validar avisos).
    MP_EMAIL_PAGADOR_PRUEBA    Solo en pruebas: correo @testuser.com que
                               Mercado Pago exige como pagador en sandbox.
"""

import hashlib
import hmac
import os

import requests
from dotenv import load_dotenv

load_dotenv()

API_MP = "https://api.mercadopago.com"
TIMEOUT_SEGUNDOS = 20

TIPOS_TARJETA = {"credit_card", "debit_card"}


class ErrorMercadoPago(Exception):
    """Error al comunicarse con Mercado Pago. Nunca incluye el token."""


def _access_token() -> str:
    token = (os.getenv("MP_ACCESS_TOKEN") or "").strip()
    if not token:
        raise ErrorMercadoPago("Falta configurar MP_ACCESS_TOKEN en el entorno.")
    return token


def _mensaje_de_error(respuesta: requests.Response) -> str:
    try:
        datos = respuesta.json()
    except ValueError:
        return respuesta.text[:200]
    errores = datos.get("errors") or []
    if errores and isinstance(errores, list):
        primero = errores[0]
        return f"{primero.get('code')}: {primero.get('message')}"
    return datos.get("message") or datos.get("error") or respuesta.text[:200]


def crear_orden(
    pedido_id: int,
    monto: float,
    token: str,
    metodo_pago: str,
    tipo_pago: str,
    cuotas: int,
    email_pagador: str,
) -> dict:
    """
    Cobra con tarjeta. Regresa la orden tal como la responde Mercado Pago
    (incluye status y status_detail, aprobada o rechazada).

    El monto lo calcula el backend a partir del pedido; nunca se toma
    del navegador.
    """
    if tipo_pago not in TIPOS_TARJETA:
        raise ErrorMercadoPago("Solo se aceptan tarjetas de crédito o débito.")

    importe = f"{monto:.2f}"
    # En pruebas, Mercado Pago solo acepta correos de su dominio de prueba.
    email = (os.getenv("MP_EMAIL_PAGADOR_PRUEBA") or "").strip() or email_pagador

    cuerpo = {
        "type": "online",
        "processing_mode": "automatic",
        "total_amount": importe,
        # Así relacionamos la orden de Mercado Pago con nuestro pedido.
        "external_reference": str(pedido_id),
        "payer": {"email": email},
        "transactions": {
            "payments": [
                {
                    "amount": importe,
                    "payment_method": {
                        "id": metodo_pago,
                        "type": tipo_pago,
                        "token": token,
                        "installments": int(cuotas),
                    },
                }
            ]
        },
    }

    # La "llave de idempotencia" evita cobrar dos veces si la misma
    # solicitud se manda de nuevo (por ejemplo, doble clic). Cada token
    # es de un solo uso, así que el token identifica el intento.
    llave = hashlib.sha256(f"almas-{pedido_id}-{token}".encode()).hexdigest()

    try:
        respuesta = requests.post(
            f"{API_MP}/v1/orders",
            json=cuerpo,
            headers={
                "Authorization": f"Bearer {_access_token()}",
                "X-Idempotency-Key": llave,
            },
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as error:
        raise ErrorMercadoPago(f"No se pudo conectar con Mercado Pago: {error}") from error

    if respuesta.status_code in (200, 201):
        return respuesta.json()

    # Cuando la tarjeta se rechaza, Mercado Pago puede responder con un
    # error (402) que de todos modos trae la orden fallida en "data".
    try:
        datos = respuesta.json()
    except ValueError:
        datos = {}
    orden = datos.get("data") if isinstance(datos, dict) else None
    if isinstance(orden, dict) and orden.get("id"):
        return orden

    raise ErrorMercadoPago(
        f"Mercado Pago respondió {respuesta.status_code}: {_mensaje_de_error(respuesta)}"
    )


def obtener_orden(order_id: str) -> dict:
    """Consulta una orden directamente a Mercado Pago (fuente confiable)."""
    if not str(order_id).isalnum():
        raise ErrorMercadoPago("El identificador de la orden no es válido.")

    try:
        respuesta = requests.get(
            f"{API_MP}/v1/orders/{order_id}",
            headers={"Authorization": f"Bearer {_access_token()}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as error:
        raise ErrorMercadoPago(f"No se pudo conectar con Mercado Pago: {error}") from error

    if respuesta.status_code != 200:
        raise ErrorMercadoPago(
            f"Mercado Pago respondió {respuesta.status_code}: {_mensaje_de_error(respuesta)}"
        )
    return respuesta.json()


def validar_firma_webhook(
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str | None,
) -> bool:
    # Comprueba que la notificación realmente viene de Mercado Pago.
    # Mercado Pago firma con HMAC-SHA256 el texto
    #   id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;
    # usando la clave secreta de Webhooks del panel (MP_WEBHOOK_SECRET).
    secreto = (os.getenv("MP_WEBHOOK_SECRET") or "").strip()
    if not secreto or not x_signature:
        return False

    partes = {}
    for parte in x_signature.split(","):
        clave, _, valor = parte.strip().partition("=")
        partes[clave.strip()] = valor.strip()

    ts = partes.get("ts")
    firma_recibida = partes.get("v1")
    if not ts or not firma_recibida:
        return False

    # Solo se incluyen los datos que llegaron en la notificación.
    manifest = ""
    if data_id:
        manifest += f"id:{str(data_id).lower()};"
    if x_request_id:
        manifest += f"request-id:{x_request_id};"
    manifest += f"ts:{ts};"

    firma_calculada = hmac.new(
        secreto.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # compare_digest evita ataques que miden cuánto tarda la comparación.
    return hmac.compare_digest(firma_calculada, firma_recibida)
