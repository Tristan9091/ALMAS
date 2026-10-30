from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import HTTPConnection
from strawberry.fastapi import GraphQLRouter

from crear_admin import asegurar_admin_desde_entorno
from database import crear_tablas
from schema import schema
from webhooks import router as webhooks_router

from fastapi import File, UploadFile, HTTPException, Header
from sqlmodel import Session

from auth import decode_access_token, get_token_from_header
from database import engine
from models import Usuario
from cloudinary_service import subir_imagen

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crea tablas faltantes y agrega columnas nuevas (con respaldo previo).
    crear_tablas()
    # Si existen ADMIN_EMAIL y ADMIN_PASSWORD, asegura esa cuenta de admin.
    asegurar_admin_desde_entorno()
    yield

app = FastAPI(lifespan=lifespan)
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4321",
        "http://127.0.0.1:4321",
        "https://almasjeweler.netlify.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
 
async def get_context(request: HTTPConnection):
    # HTTPConnection es la base común de Request (HTTP) y WebSocket,
    # así el mismo contexto sirve para queries, mutations y subscriptions.
    return {
        "request": request
    }
 
 
graphql_app = GraphQLRouter(
    schema,
    context_getter=get_context
)
 
 
app.include_router(
    graphql_app,
    prefix="/graphql"
)

# Ruta HTTP normal (no GraphQL) porque Mercado Pago llama directo al servidor.
app.include_router(webhooks_router)

@app.post("/admin/subir-imagen")
async def subir_imagen_producto(
    archivo: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    token = get_token_from_header(authorization)
    payload = decode_access_token(token) if token else None

    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="No autenticado")

    try:
        usuario_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Token invalido")

    with Session(engine) as session:
        usuario = session.get(Usuario, usuario_id)

        if not usuario or not usuario.activo or usuario.rol != "admin":
            raise HTTPException(status_code=403, detail="Acceso denegado")

    tipos_permitidos = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if archivo.content_type not in tipos_permitidos:
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten imagenes JPG, PNG y WebP",
        )

    contenido = await archivo.read(5 * 1024 * 1024 + 1)

    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="La imagen no puede superar los 5 MB",
        )

    try:
        from io import BytesIO

        resultado = subir_imagen(BytesIO(contenido))
        return resultado

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="No se pudo subir la imagen a Cloudinary",
        )