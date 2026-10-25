"""
probar_subscription.py — Escucha en la terminal los eventos del backoffice.

Sirve para comprobar que la subscription funciona ANTES de conectar el frontend.

Uso (con el servidor encendido):
    python probar_subscription.py correo_admin@ejemplo.com TuContraseña
    python probar_subscription.py correo_admin@ejemplo.com TuContraseña https://almas-1.onrender.com

Luego, en otra ventana, crea un pedido, registra un cliente o cambia un stock:
verás el aviso aparecer aquí al instante. Ctrl+C para salir.
"""

import asyncio
import json
import sys

import requests
import websockets

QUERY = (
    "subscription { eventosBackoffice { tipo mensaje pedidoId fecha } }"
)


def iniciar_sesion(url: str, email: str, password: str) -> str:
    respuesta = requests.post(
        url,
        json={
            "query": "mutation($d: LoginInput!) { login(data: $d) { token } }",
            "variables": {"d": {"email": email, "password": password}},
        },
        timeout=30,
    ).json()
    if respuesta.get("errors"):
        sys.exit(f"No se pudo iniciar sesión: {respuesta['errors'][0]['message']}")
    return respuesta["data"]["login"]["token"]


async def escuchar(url_ws: str, token: str) -> None:
    async with websockets.connect(
        url_ws, subprotocols=["graphql-transport-ws"]
    ) as ws:
        # Los navegadores no pueden poner headers en un WebSocket: el token va
        # en el mensaje de inicio (connection_init).
        await ws.send(
            json.dumps(
                {
                    "type": "connection_init",
                    "payload": {"authorization": f"Bearer {token}"},
                }
            )
        )
        await ws.recv()  # connection_ack
        await ws.send(
            json.dumps({"id": "1", "type": "subscribe", "payload": {"query": QUERY}})
        )
        print("Conectado. Esperando eventos... (Ctrl+C para salir)\n")
        async for crudo in ws:
            mensaje = json.loads(crudo)
            if mensaje["type"] == "next":
                datos = mensaje["payload"].get("data")
                errores = mensaje["payload"].get("errors")
                if errores:
                    print("Error:", errores[0]["message"])
                    return
                evento = datos["eventosBackoffice"]
                print(f"[{evento['tipo']}] {evento['mensaje']}")
            elif mensaje["type"] in ("error", "complete"):
                print("Subscription terminada:", mensaje)
                return


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    email, password = sys.argv[1], sys.argv[2]
    base = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8000"
    url = base.rstrip("/") + "/graphql"
    token = iniciar_sesion(url, email, password)
    try:
        asyncio.run(escuchar(url.replace("http", "ws", 1), token))
    except KeyboardInterrupt:
        print("\nListo.")


if __name__ == "__main__":
    main()
