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