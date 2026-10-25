from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import HTTPConnection
from strawberry.fastapi import GraphQLRouter

from crear_admin import asegurar_admin_desde_entorno
from database import crear_tablas
from schema import schema
from webhooks import router as webhooks_router

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