
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict, field_validator

from ai_service import responder_consulta


router = APIRouter(prefix="/api/ai", tags=["Asistente IA"])

logger = logging.getLogger(__name__)


class MensajeHistorial(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("role")
    @classmethod
    def validar_rol(cls, valor: str) -> str:
        if valor not in ("user", "assistant"):
            raise ValueError("Rol no permitido")
        return valor


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mensaje: str = Field(min_length=1, max_length=2000)
    historial: list[MensajeHistorial] = Field(
        default_factory=list,
        max_length=10,
    )

    @field_validator("mensaje")
    @classmethod
    def validar_mensaje(cls, valor: str) -> str:
        valor = valor.strip()

        if not valor:
            raise ValueError("El mensaje no puede estar vacio")

        return valor


class ChatResponse(BaseModel):
    respuesta: str


@router.post("/chat", response_model=ChatResponse)
async def chat_ia(datos: ChatRequest, request: Request):
    try:
        historial = [
            mensaje.model_dump()
            for mensaje in datos.historial
        ]

        respuesta = await asyncio.wait_for(
            responder_consulta(
                mensaje=datos.mensaje,
                historial=historial,
            ),
            timeout=60,
        )

        return ChatResponse(respuesta=respuesta)

    except asyncio.TimeoutError:
        logger.warning("Tiempo agotado en el asistente IA")

        raise HTTPException(
            status_code=504,
            detail="El asistente tardo demasiado en responder.",
        )

    except Exception:
        logger.exception("Error interno del asistente IA")

        raise HTTPException(
            status_code=503,
            detail="El asistente no esta disponible temporalmente.",
        )
