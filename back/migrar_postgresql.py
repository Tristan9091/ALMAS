import os
import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text, inspect
from sqlmodel import SQLModel

import models  # Registra las tablas de SQLModel


BASE_DIR = Path(__file__).resolve().parent
SQLITE_PATH = Path(
    os.getenv("ALMAS_DB_PATH", str(BASE_DIR / "db.sqlite3"))
).expanduser().resolve()

TABLAS = [
    "categoria",
    "producto",
    "variante",
    "usuario",
    "pedido",
    "detallepedido",
    "pago",
    "notificacion_email",
]

COLUMNAS_BOOLEANAS = {
    "producto": {"activo"},
    "usuario": {"activo"},
    "pago": {"inventario_aplicado"},
}

COLUMNAS_FECHA = {
    "pedido": {"fecha"},
    "pago": {"fecha_creacion", "fecha_actualizacion"},
    "notificacion_email": {"fecha_creacion", "fecha_actualizacion"},
}


def obtener_url_postgresql():
    url = os.getenv("POSTGRES_MIGRATION_URL")

    if not url:
        raise RuntimeError("Falta POSTGRES_MIGRATION_URL.")

    if url.startswith("postgresql://"):
        url = url.replace(
            "postgresql://",
            "postgresql+psycopg://",
            1,
        )

    return url


def convertir_valor(tabla, columna, valor):
    if valor is None:
        return None

    if columna in COLUMNAS_BOOLEANAS.get(tabla, set()):
        return bool(valor)

    if columna in COLUMNAS_FECHA.get(tabla, set()):
        if isinstance(valor, str):
            return datetime.fromisoformat(valor)

    return valor


def leer_sqlite():
    if not SQLITE_PATH.is_file():
        raise FileNotFoundError(
            f"No existe la base SQLite: {SQLITE_PATH}"
        )

    conexion = sqlite3.connect(
        f"file:{SQLITE_PATH}?mode=ro",
        uri=True,
    )
    conexion.row_factory = sqlite3.Row

    try:
        datos = {}

        for tabla in TABLAS:
            filas = conexion.execute(
                f'SELECT * FROM "{tabla}"'
            ).fetchall()

            datos[tabla] = [
                {
                    columna: convertir_valor(
                        tabla, columna, fila[columna]
                    )
                    for columna in fila.keys()
                }
                for fila in filas
            ]

        return datos
    finally:
        conexion.close()


def migrar():
    datos = leer_sqlite()
    url = obtener_url_postgresql()

    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )

    try:
        with engine.connect() as conexion:
            conexion.execute(text("SELECT 1"))

        print("Conexion a PostgreSQL correcta.")
        print("Registros encontrados en SQLite:")

        for tabla in TABLAS:
            print(f"  {tabla}: {len(datos[tabla])}")

        confirmacion = input(
            "\nEscribe MIGRAR para copiar estos datos: "
        ).strip()

        if confirmacion != "MIGRAR":
            print("Migracion cancelada.")
            return

        SQLModel.metadata.create_all(engine)

        with engine.begin() as conexion:
            inspector = inspect(conexion)

            for tabla in TABLAS:
                if tabla not in inspector.get_table_names():
                    raise RuntimeError(
                        f"No existe la tabla {tabla} en PostgreSQL."
                    )

                cantidad = conexion.execute(
                    text(f'SELECT COUNT(*) FROM "{tabla}"')
                ).scalar_one()

                if cantidad != 0:
                    raise RuntimeError(
                        f"La tabla {tabla} ya tiene datos. "
                        "No se realizo la migracion."
                    )

            for tabla in TABLAS:
                filas = datos[tabla]

                if not filas:
                    continue

                columnas = list(filas[0].keys())

                nombres = ", ".join(
                    f'"{columna}"' for columna in columnas
                )
                parametros = ", ".join(
                    f":{columna}" for columna in columnas
                )

                consulta = text(
                    f'INSERT INTO "{tabla}" '
                    f"({nombres}) VALUES ({parametros})"
                )

                conexion.execute(consulta, filas)

                print(
                    f"Migrados {len(filas)} registros de {tabla}."
                )

            for tabla in TABLAS:
                secuencia = conexion.execute(
                    text(
                        "SELECT pg_get_serial_sequence("
                        ":tabla, 'id')"
                    ),
                    {"tabla": tabla},
                ).scalar_one_or_none()

                if secuencia:
                    conexion.execute(
                        text(
                            "SELECT setval("
                            "CAST(:secuencia AS regclass), "
                            "COALESCE(MAX(id), 1), "
                            "COUNT(*) > 0"
                            f') FROM "{tabla}"'
                        ),
                        {"secuencia": secuencia},
                    )

            for tabla in TABLAS:
                cantidad = conexion.execute(
                    text(f'SELECT COUNT(*) FROM "{tabla}"')
                ).scalar_one()

                if cantidad != len(datos[tabla]):
                    raise RuntimeError(
                        f"Error al verificar la tabla {tabla}."
                    )

        print("\nMigracion completada correctamente.")
        print("Todos los registros fueron verificados.")

    finally:
        engine.dispose()


if __name__ == "__main__":
    migrar()