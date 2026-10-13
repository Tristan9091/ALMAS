import hashlib
import hmac
import os
import requests
from dotenv import load_dotenv
 
load_dotenv()
 
API_MP = "https://api.mercadopago.com"
TIMEOUT_SEGUNDOS = 15
 
 
class ErrorMercadoPago(Exception):
    """Error al comunicarse con Mercado Pago. Nunca incluye el token."""
 
 
def _access_token() -> str:
    token = (os.getenv("MP_ACCESS_TOKEN") or "").strip()
    if not token:
        raise ErrorMercadoPago("Falta configurar MP_ACCESS_TOKEN en el entorno.")
    return token
 
 
def _url_entorno(nombre: str, por_defecto: str = "") -> str:
    return (os.getenv(nombre) or por_defecto).strip().rstrip("/")
 
 
def _es_publica(url: str) -> bool:
    """Mercado Pago solo puede llegar a URLs públicas con HTTPS."""
    return url.startswith("https://")
 
 
def _mensaje_de_error(respuesta: requests.Response) -> str:
    try:
        datos = respuesta.json()
        return datos.get("message") or datos.get("error") or respuesta.text[:200]
    except ValueError:
        return respuesta.text[:200]
 
 
def crear_preferencia(
    pedido_id: int,
    items: list[dict],
    email_comprador: str,
) -> dict:
    # Crea una preferencia de pago en Mercado Pago con los productos
    # y precios del pedido, y devuelve el ID y el enlace para pagar.
    frontend = _url_entorno("FRONTEND_URL", "http://localhost:4321")
    backend = _url_entorno("BACKEND_URL")
 
    cuerpo = {
        "items": [
            {
                "id": str(item["id"]),
                "title": item["title"],
                "quantity": int(item["quantity"]),
                "unit_price": round(float(item["unit_price"]), 2),
                "currency_id": "MXN",
            }
            for item in items
        ],
        # relacionar el pago de Mercado Pago con nuestro pedido.
        "external_reference": str(pedido_id),
        "payer": {"email": email_comprador},
        "back_urls": {
            "success": f"{frontend}/pago/exito?pedido={pedido_id}",
            "pending": f"{frontend}/pago/pendiente?pedido={pedido_id}",
            "failure": f"{frontend}/pago/error?pedido={pedido_id}",
        },
        "statement_descriptor": "ALMAS JOYERIA",
    }
 
    # solo se activa cuando el frontend está publicado con HTTPS.
    if _es_publica(frontend):
        cuerpo["auto_return"] = "approved"
 
    # Los webhooks solo funcionan si Mercado Pago puede llegar al backend.
    if _es_publica(backend):
        cuerpo["notification_url"] = f"{backend}/webhooks/mercadopago"
 
    try:
        respuesta = requests.post(
            f"{API_MP}/checkout/preferences",
            json=cuerpo,
            headers={"Authorization": f"Bearer {_access_token()}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as error:
        raise ErrorMercadoPago(f"No se pudo conectar con Mercado Pago: {error}") from error
 
    if respuesta.status_code not in (200, 201):
        raise ErrorMercadoPago(
            f"Mercado Pago respondió {respuesta.status_code}: {_mensaje_de_error(respuesta)}"
        )
 
    datos = respuesta.json()
    return {
        "id": datos["id"],
        "init_point": datos["init_point"],
    }


def obtener_pago(payment_id: str) -> dict:
    # Consulta un pago directamente a Mercado Pago.
    # Es la única fuente confiable del estado real de un pago.
    if not str(payment_id).isdigit():
        raise ErrorMercadoPago("El identificador de pago no es válido.")

    try:
        respuesta = requests.get(
            f"{API_MP}/v1/payments/{payment_id}",
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
    #   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
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
    