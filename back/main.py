from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
from schema import schema
from database import crear_tablas
from fastapi.middleware.cors import CORSMiddleware

crear_tablas()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # para desarrollo; en producción restringirías esto
    allow_methods=["*"],
    allow_headers=["*"],
)

graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")