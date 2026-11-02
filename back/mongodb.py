import os
from functools import lru_cache

import certifi
from pymongo import MongoClient


MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "almas")


@lru_cache(maxsize=1)
def obtener_cliente_mongo():
    uri = os.getenv("MONGODB_URI")

    if not uri:
        raise RuntimeError("Falta configurar MONGODB_URI.")

    return MongoClient(
        uri,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=3000,
        connectTimeoutMS=3000,
    )


def obtener_base_mongo():
    return obtener_cliente_mongo()[MONGODB_DB_NAME]


def verificar_conexion_mongo():
    obtener_cliente_mongo().admin.command("ping")
    print("[MongoDB] Conexion exitosa a MongoDB Atlas.")