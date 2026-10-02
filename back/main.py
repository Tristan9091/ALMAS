from fastapi import FastAPI, Request
from strawberry.fastapi import GraphQLRouter
from fastapi.middleware.cors import CORSMiddleware

from schema import schema


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4321",
        "http://127.0.0.1:4321",
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