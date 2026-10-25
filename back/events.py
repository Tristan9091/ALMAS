"""
events.py — "Timbre" interno del backoffice (publicar / suscribir).

Cada administrador conectado por WebSocket tiene su propia cola. Cuando algo
pasa (pedido nuevo, pago aprobado, stock bajo...) se llama a publicar() y el
evento se reparte a todas las colas.

publicar() se puede llamar desde cualquier hilo: los resolvers de GraphQL y el
webhook de Mercado Pago no corren en el mismo hilo que las subscriptions.
Este bus vive en la memoria de UN proceso; si algún día se corren varios
workers, habría que cambiarlo por Redis (u otro broker).
"""

import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

_suscriptores: set[asyncio.Queue] = set()
_loop: Optional[asyncio.AbstractEventLoop] = None


async def suscribir() -> AsyncGenerator[dict, None]:
    """Generador asíncrono: entrega cada evento a un cliente conectado."""
    global _loop
    _loop = asyncio.get_running_loop()
    cola: asyncio.Queue = asyncio.Queue(maxsize=100)
    _suscriptores.add(cola)
    try:
        while True:
            yield await cola.get()
    finally:
        # Se ejecuta al cerrar la pestaña o cancelar la subscription.
        _suscriptores.discard(cola)


def publicar(tipo: str, mensaje: str, pedido_id: Optional[int] = None) -> None:
    """Envía un evento a todos los administradores conectados.

    Llamar SIEMPRE después de confirmar (commit) los cambios en la base de datos.
    Si nadie está conectado, no hace nada.
    """
    loop = _loop
    if loop is None or not _suscriptores:
        return

    evento = {
        "tipo": tipo,
        "mensaje": mensaje,
        "pedido_id": pedido_id,
        "fecha": datetime.now(timezone.utc),
    }

    def _repartir() -> None:
        for cola in list(_suscriptores):
            try:
                cola.put_nowait(evento)
            except asyncio.QueueFull:
                pass  # cliente lento: pierde el aviso, no frena a los demás

    try:
        loop.call_soon_threadsafe(_repartir)
    except RuntimeError:
        pass  # el loop ya se cerró (el servidor se está apagando)
