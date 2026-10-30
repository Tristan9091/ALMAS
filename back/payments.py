"""
payments.py — Comunicación de ALMAS con Mercado Pago (Checkout API vía Orders).

Este módulo crea y consulta órdenes, y verifica firmas de webhooks.
No modifica pedidos, pagos ni inventario: esa lógica vive en webhooks.py.

Variables de entorno:
    MP_ACCESS_TOKEN
    MP_WEBHOOK_SECRET
    MP_EMAIL_PAGADOR_PRUEBA  (solo para sandbox)
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
    """
    Error al comunicarse con Mercado Pago.

    resultado_incierto=True indica que no sabemos si hubo cobro.
    codigo contiene el motivo informado por Mercado Pago, si existe.
    """

    def __init__(
        self,
        mensaje: str,
        resultado_incierto: bool = False,
        codigo: str | None = None,
        http_status: int | None = None,
    ):
        super().__init__(mensaje)
        self.resultado_incierto = resultado_incierto
        self.codigo = codigo
        self.http_status = http_status


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

    if not isinstance(datos, dict):
        return respuesta.text[:200]

    errores = datos.get("errors") or []
    if isinstance(errores, list) and errores:
        primero = errores[0]
        if isinstance(primero, dict):
            return f"{primero.get('code')}: {primero.get('message')}"

    return str(datos.get("message") or datos.get("error") or respuesta.text[:200])


def obtener_codigo_error(datos: dict | None) -> str | None:
    """Extrae el motivo del error de una respuesta de Mercado Pago."""

    if not isinstance(datos, dict):
        return None

    # Algunas respuestas incluyen el motivo directamente.
    for campo in ("status_detail", "error_code"):
        valor = datos.get(campo)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()

    # Otras respuestas incluyen una lista de errores.
    errores = datos.get("errors")

    if isinstance(errores, list):
        for error in errores:
            if not isinstance(error, dict):
                continue

            for campo in ("code", "status_detail"):
                valor = error.get(campo)
                if isinstance(valor, str) and valor.strip():
                    return valor.strip()

    return None

def crear_orden(
    pedido_id: int,
    monto: float,
    token: str,
    metodo_pago: str,
    tipo_pago: str,
    cuotas: int,
    email_pagador: str,
    intento_id: int | None = None,
) -> dict:
    """Envía un intento de cobro y devuelve la orden de Mercado Pago.

    Los intentos nuevos se identifican como 'pedido_id_intento_id'.
    Se admite intento_id=None temporalmente para órdenes antiguas; los
    nuevos pagos deben enviarlo desde schema.py.
    """
    if tipo_pago not in TIPOS_TARJETA:
        raise ErrorMercadoPago("Solo se aceptan tarjetas de crédito o débito.")
    if pedido_id <= 0:
        raise ErrorMercadoPago("El identificador del pedido no es válido.")
    if intento_id is not None and intento_id <= 0:
        raise ErrorMercadoPago("El identificador del intento no es válido.")
    if not token or not token.strip():
        raise ErrorMercadoPago("Faltan los datos de la tarjeta.")
    if not metodo_pago or not metodo_pago.strip():
        raise ErrorMercadoPago("Falta indicar el método de pago.")
    if cuotas < 1:
        raise ErrorMercadoPago("Las cuotas deben ser mayores que cero.")
    if monto <= 0:
        raise ErrorMercadoPago("El monto del pedido debe ser mayor que cero.")

    # Obtener las credenciales ANTES de enviar el cobro: si faltan,
    # es un error seguro (la solicitud nunca llegó a Mercado Pago).
    access_token = _access_token()
    importe = f"{monto:.2f}"
    email = (os.getenv("MP_EMAIL_PAGADOR_PRUEBA") or "").strip() or email_pagador

    referencia = (
        f"{pedido_id}_{intento_id}"
        if intento_id is not None
        else str(pedido_id)
    )
    cuerpo = {
        "type": "online",
        "processing_mode": "automatic",
        "total_amount": importe,
        "external_reference": referencia,
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

    # La idempotencia se asocia al intento guardado en ALMAS.
    # El token solo se usa como respaldo para integraciones anteriores.
    if intento_id is not None:
        semilla = f"almas-pago-{pedido_id}-{intento_id}"
    else:
        semilla = f"almas-{pedido_id}-{token}"
    llave = hashlib.sha256(semilla.encode("utf-8")).hexdigest()

    try:
        respuesta = requests.post(
            f"{API_MP}/v1/orders",
            json=cuerpo,
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-Idempotency-Key": llave,
            },
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as error:
        # Un timeout o corte de red no permite saber si hubo cobro.
        raise ErrorMercadoPago(
            f"No se recibió una respuesta confiable de Mercado Pago: {error}",
            resultado_incierto=True,
        ) from error

    try:
        datos = respuesta.json()
    except ValueError:
        datos = None

    if respuesta.status_code in (200, 201):
        if isinstance(datos, dict) and datos.get("id"):
            return datos
        raise ErrorMercadoPago(
            "Mercado Pago respondió correctamente, pero sin una orden identificable.",
            resultado_incierto=True,
        )

    # Algunos cobros rechazados llegan como HTTP 402 y contienen la
    # orden fallida dentro de data; se registra para liberar inventario.
    if respuesta.status_code == 402:
        orden = datos.get("data") if isinstance(datos, dict) else None
        if isinstance(orden, dict) and orden.get("id"):
            return orden

   
    # Respuestas sin una orden procesable.
    # Los errores de red, servidor y estados ambiguos se consideran inciertos.
    resultado_incierto = respuesta.status_code not in {
        400, 401, 402, 403, 404, 422
    }

    codigo_error = obtener_codigo_error(datos)

    print(
        f"[Mercado Pago] HTTP {respuesta.status_code}, "
        f"codigo={codigo_error}, "
        f"detalle={_mensaje_de_error(respuesta)}"
    )

    raise ErrorMercadoPago(
        mensaje=(
            f"Mercado Pago respondió {respuesta.status_code}: "
            f"{_mensaje_de_error(respuesta)}"
        ),
        resultado_incierto=resultado_incierto,
        codigo=codigo_error,
        http_status=respuesta.status_code,
    )



def obtener_orden(order_id: str) -> dict:
    """Consulta una orden real de Mercado Pago sin cambiar la base."""
    order_id = str(order_id).strip()
    if not order_id or not order_id.isalnum():
        raise ErrorMercadoPago("El identificador de la orden no es válido.")

    try:
        respuesta = requests.get(
            f"{API_MP}/v1/orders/{order_id}",
            headers={"Authorization": f"Bearer {_access_token()}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as error:
        raise ErrorMercadoPago(
            f"No se pudo consultar la orden en Mercado Pago: {error}"
        ) from error

    if respuesta.status_code != 200:
        raise ErrorMercadoPago(
            f"Mercado Pago respondió {respuesta.status_code}: "
            f"{_mensaje_de_error(respuesta)}"
        )

    try:
        orden = respuesta.json()
    except ValueError as error:
        raise ErrorMercadoPago(
            "Mercado Pago devolvió una respuesta inválida al consultar la orden."
        ) from error

    if not isinstance(orden, dict) or not orden.get("id"):
        raise ErrorMercadoPago("No se obtuvo una orden válida de Mercado Pago.")
    return orden


def validar_firma_webhook(
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str | None,
) -> bool:
    """Verifica la firma HMAC-SHA256 enviada con el aviso de Mercado Pago."""
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

    # El manifiesto usa los datos presentes en la notificación.
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
    return hmac.compare_digest(firma_calculada, firma_recibida)
