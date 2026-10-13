from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter

from database import crear_tablas
from schema import schema
from webhooks import router as webhooks_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    crear_tablas()
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
 
 
async def get_context(request: Request):
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
