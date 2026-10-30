
import os

from dotenv import load_dotenv
from sqlmodel import Session, select

from database import engine, transaccion_pago
from models import NotificacionEmail, ahora
from email_service import enviar_confirmacion_compra

load_dotenv()

EMAIL_MODO_DEMO = os.getenv("EMAIL_MODO_DEMO", "true").lower() == "true"
EMAIL_ENVIO_ACTIVO = os.getenv("EMAIL_ENVIO_ACTIVO", "false").lower() == "true"
EMAIL_DEMO_DESTINATARIO = os.getenv(
    "EMAIL_DEMO_DESTINATARIO", ""
).strip().lower()

MAX_INTENTOS = 3


def procesar_notificaciones():
    if not EMAIL_ENVIO_ACTIVO:
        return 0

    if EMAIL_MODO_DEMO and not EMAIL_DEMO_DESTINATARIO:
        print("[Resend] Falta configurar EMAIL_DEMO_DESTINATARIO.")
        return 0

    procesadas = 0

    with Session(engine) as session:
        ids = session.exec(
            select(NotificacionEmail.id)
            .where(
                NotificacionEmail.estado == "pendiente",
                NotificacionEmail.intentos < MAX_INTENTOS,
            )
            .order_by(NotificacionEmail.id)
        ).all()

    for notificacion_id in ids:

        # Reservar el correo dentro de una transaccion.
        with transaccion_pago() as session:
            notificacion = session.get(NotificacionEmail, notificacion_id)

            if (
                notificacion is None
                or notificacion.estado != "pendiente"
                or notificacion.intentos >= MAX_INTENTOS
            ):
                continue

            destinatario = notificacion.destinatario.strip()

            # Solo permitir correos autorizados en modo demo.
            if EMAIL_MODO_DEMO:
                if destinatario.lower() != EMAIL_DEMO_DESTINATARIO:
                    continue

            notificacion.estado = "enviando"
            notificacion.intentos += 1
            notificacion.fecha_actualizacion = ahora()

            pedido_id = notificacion.pedido_id
            session.add(notificacion)

        # Enviar fuera de la transaccion.
        try:
            respuesta = enviar_confirmacion_compra(
                pedido_id,
                destinatario,
            )

            resend_id = (
                respuesta.get("id")
                if isinstance(respuesta, dict)
                else getattr(respuesta, "id", None)
            )

            if not resend_id:
                raise RuntimeError(
                    "Resend no devolvio un identificador."
                )

        except Exception as error:
            # El resultado podria ser incierto.
            # No reintentar automaticamente para evitar duplicados.
            with transaccion_pago() as session:
                notificacion = session.get(
                    NotificacionEmail,
                    notificacion_id,
                )

                if notificacion and notificacion.estado == "enviando":
                    notificacion.estado = "fallido"
                    notificacion.ultimo_error = str(error)[:500]
                    notificacion.fecha_actualizacion = ahora()
                    session.add(notificacion)

            print(
                f"[Resend] Error en notificacion "
                f"#{notificacion_id}: {error}"
            )
            continue

        with transaccion_pago() as session:
            notificacion = session.get(
                NotificacionEmail,
                notificacion_id,
            )

            if notificacion and notificacion.estado == "enviando":
                notificacion.estado = "enviado"
                notificacion.resend_id = str(resend_id)
                notificacion.ultimo_error = None
                notificacion.fecha_actualizacion = ahora()
                session.add(notificacion)

        procesadas += 1

        print(
            f"[Resend] Notificacion #{notificacion_id} enviada. "
            f"Resend ID: {resend_id}"
        )

    print(f"[Resend] Total de correos enviados: {procesadas}")
    return procesadas


if __name__ == "__main__":
    procesar_notificaciones()
