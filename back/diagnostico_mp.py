import os
import re
import sys
 
import requests
from dotenv import load_dotenv
 
API = "https://api.mercadopago.com"
 
# Formatos conocidos de credenciales de Mercado Pago.
# Access Token: APP_USR-<números>-<6 dígitos>-<32 hex>-<números>  (o TEST-...)
# Public Key:   APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx      (formato UUID)
PATRON_ACCESS_TOKEN = re.compile(r"^(APP_USR|TEST)-\d+-\d{6}-[0-9a-f]{32}-\d+$")
PATRON_PUBLIC_KEY = re.compile(
    r"^(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
 
 
def titulo(texto: str) -> None:
    print(f"\n=== {texto} ===")
 
 
def describir_token(crudo: str) -> str:
    """Revisa el formato del token y devuelve la versión limpia."""
    titulo("1. Formato del token")
 
    problemas = []
    token = crudo
 
    if token != token.strip():
        problemas.append("tiene espacios o saltos de línea al inicio o al final")
        token = token.strip()
    if token[:1] in {'"', "'"} or token[-1:] in {'"', "'"}:
        problemas.append("tiene comillas pegadas")
        token = token.strip("\"'")
    if token.lower().startswith("bearer "):
        problemas.append('incluye la palabra "Bearer " (el código ya la agrega)')
        token = token[7:].strip()
 
    prefijo = token.split("-")[0] if "-" in token else token[:6]
    print(f"Prefijo: {prefijo}-…   Longitud: {len(token)} caracteres")
 
    if PATRON_PUBLIC_KEY.match(token):
        print("❌ Esto es una PUBLIC KEY, no un Access Token.")
        print("   La Public Key es para el frontend. Para crear preferencias")
        print("   necesitas el ACCESS TOKEN de la misma pantalla de credenciales.")
        sys.exit(1)
    elif PATRON_ACCESS_TOKEN.match(token):
        print("✅ El formato corresponde a un Access Token.")
    else:
        print("⚠️  El formato no coincide con un Access Token conocido.")
        print("   Revisa que copiaste el valor completo.")
 
    if problemas:
        print("⚠️  Problemas encontrados en el valor de .env:")
        for p in problemas:
            print(f"   - {p}")
        print("   El diagnóstico continúa con el valor limpio, pero corrige tu .env.")
    else:
        print("✅ Sin espacios, comillas ni prefijos extra.")
 
    return token
 
 
def revisar_cuenta(token: str) -> None:
    """Consulta a qué cuenta pertenece el token."""
    titulo("2. Cuenta dueña del token (GET /users/me)")
 
    r = requests.get(
        f"{API}/users/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    print(f"Código HTTP: {r.status_code}")
 
    if r.status_code != 200:
        print("❌ Mercado Pago no reconoce este token.")
        print(f"   Respuesta: {r.text[:300]}")
        print("   El token está mal copiado, fue renovado o es de otra aplicación.")
        sys.exit(1)
 
    datos = r.json()
    pais = datos.get("site_id")
    etiquetas = datos.get("tags") or []
    es_prueba = "test_user" in etiquetas
 
    print(f"ID de usuario: {datos.get('id')}")
    print(f"Apodo:         {datos.get('nickname')}")
    print(f"País (site):   {pais}")
    print(f"Tipo:          {'CUENTA DE PRUEBA' if es_prueba else 'cuenta real'}")
 
    if pais != "MLM":
        print("❌ La cuenta no es de México (MLM). Con moneda MXN eso causa rechazos.")
        print("   Crea la aplicación o las cuentas de prueba con país México.")
    else:
        print("✅ La cuenta es de México.")
 
    if not es_prueba and token.startswith("APP_USR"):
        print("⚠️  Estás usando el token de tu CUENTA REAL.")
        print("   Si tu cuenta real no tiene la verificación de identidad completa,")
        print("   Mercado Pago bloquea la API con PA_UNAUTHORIZED_RESULT_FROM_POLICIES.")
        print("   Para pruebas usa las credenciales de prueba de tu aplicación.")
 
 
def probar_preferencia(token: str) -> None:
    """Intenta crear una preferencia mínima de $100 MXN."""
    titulo("3. Crear preferencia de prueba (POST /checkout/preferences)")
 
    cuerpo = {
        "items": [
            {
                "id": "diagnostico-1",
                "title": "Producto de prueba ALMAS",
                "quantity": 1,
                "currency_id": "MXN",
                "unit_price": 100.0,
            }
        ],
        "external_reference": "diagnostico-almas",
    }
 
    r = requests.post(
        f"{API}/checkout/preferences",
        json=cuerpo,
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    print(f"Código HTTP: {r.status_code}")
 
    if r.status_code in (200, 201):
        datos = r.json()
        print("✅ ¡Preferencia creada! El problema de autorización está resuelto.")
        print(f"   preference_id: {datos.get('id')}")
        print(f"   init_point:    {datos.get('init_point')}")
        return
 
    try:
        datos = r.json()
    except ValueError:
        datos = {}
 
    print(f"Código MP: {datos.get('code')}")
    print(f"Mensaje:   {datos.get('message')}")
    print(f"Bloqueado por: {datos.get('blocked_by')}")
 
    if datos.get("code") == "PA_UNAUTHORIZED_RESULT_FROM_POLICIES":
        print("\n❌ El token es válido pero la cuenta NO tiene permiso de cobrar.")
        print("   Esto se arregla en el panel de Mercado Pago, no en el código.")
        print("   Revisa la guía de pasos que acompaña este script.")
 
 
def main() -> None:
    load_dotenv()
    crudo = os.getenv("MP_ACCESS_TOKEN")
 
    if not crudo:
        print("❌ No se encontró MP_ACCESS_TOKEN.")
        print("   Revisa que back/.env exista y que corras el script desde back/.")
        sys.exit(1)
 
    token = describir_token(crudo)
    revisar_cuenta(token)
    probar_preferencia(token)
 
 
if __name__ == "__main__":
    main()
 