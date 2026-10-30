# back/database.py
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager

from sqlalchemy import inspect, text
from sqlmodel import SQLModel, create_engine, Session

from uuid import uuid4

BASE_DIR = Path(__file__).resolve().parent

DB_PATH = Path(
    os.getenv("ALMAS_DB_PATH", str(BASE_DIR / "db.sqlite3"))
).expanduser().resolve()

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"timeout": 30},
)


@contextmanager
def transaccion_pago():
    """
    Bloquea las escrituras de SQLite mientras se comprueban
    y actualizan los datos de un pago.

    Funciona entre procesos que compartan el mismo archivo SQLite.
    """
    with engine.connect() as conexion:
        conexion.exec_driver_sql("BEGIN IMMEDIATE")

        with Session(bind=conexion) as session:
            try:
                yield session
                session.flush()
                conexion.commit()
            except Exception:
                conexion.rollback()
                raise



# Columnas agregadas después de que la base ya tenía datos.
# SQLite no las agrega solo con create_all, así que se agregan aquí.
# Formato: (tabla, columna, definición SQL con valor por defecto)
COLUMNAS_NUEVAS = [
    ("usuario", "rol", "VARCHAR NOT NULL DEFAULT 'cliente'"),
    ("producto", "activo", "BOOLEAN NOT NULL DEFAULT 1"),
    ("pago", "order_id", "VARCHAR"),
]


def _respaldar_base() -> Path | None:
    """Copia la base de datos completa antes de modificarla."""
    ruta = Path(engine.url.database or "")
    if not ruta.exists():
        return None

    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = ruta.with_name(f"{ruta.stem}.respaldo-{marca}{ruta.suffix}")

    # La API de respaldo de SQLite copia la base de forma consistente,
    # aunque el servidor la esté usando.
    origen = sqlite3.connect(ruta)
    copia = sqlite3.connect(destino)
    with copia:
        origen.backup(copia)
    origen.close()
    copia.close()

    return destino

def migrar_claves_idempotencia():
    """
    Agrega una clave unica a cada intento de pago existente.
    No modifica las claves que ya estan guardadas.
    """
    inspector = inspect(engine)

    if "pago" not in inspector.get_table_names():
        return

    columnas = {
        columna["name"]
        for columna in inspector.get_columns("pago")
    }

    if "clave_idempotencia" not in columnas:
        _respaldar_base()

        with engine.begin() as conexion:
            conexion.execute(
                text("ALTER TABLE pago ADD COLUMN clave_idempotencia VARCHAR")
            )

        print("[Migracion] Columna clave_idempotencia agregada.")

    with engine.begin() as conexion:
        pagos = conexion.execute(
            text(
                "SELECT id FROM pago "
                "WHERE clave_idempotencia IS NULL "
                "OR clave_idempotencia = ''"
            )
        ).fetchall()

        for pago in pagos:
            conexion.execute(
                text(
                    "UPDATE pago "
                    "SET clave_idempotencia = :clave "
                    "WHERE id = :id"
                ),
                {
                    "clave": str(uuid4()),
                    "id": pago.id,
                }
            )

        conexion.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_pago_clave_idempotencia "
                "ON pago (clave_idempotencia)"
            )
        )

    print("[Migracion] Claves de idempotencia verificadas.")


def migrar():
    """
    Agrega las columnas que le falten a la base existente.

    - Se puede correr muchas veces: si la columna ya existe, no hace nada.
    - Antes de cambiar algo, guarda un respaldo de la base.
    - No borra ni modifica registros: los existentes toman el valor
      por defecto (los usuarios quedan como "cliente").
    """
    inspector = inspect(engine)
    tablas = set(inspector.get_table_names())

    faltantes = [
        (tabla, columna, definicion)
        for tabla, columna, definicion in COLUMNAS_NUEVAS
        if tabla in tablas
        and columna not in {c["name"] for c in inspector.get_columns(tabla)}
    ]
    if not faltantes:
        return

    respaldo = _respaldar_base()
    if respaldo:
        print(f"[Migración] Respaldo guardado en {respaldo.name}")

    with engine.begin() as conexion:
        for tabla, columna, definicion in faltantes:
            conexion.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {columna} {definicion}"))
            print(f"[Migración] Columna agregada: {tabla}.{columna}")


def crear_tablas():
    SQLModel.metadata.create_all(engine)
    migrar()
    migrar_claves_idempotencia()


def get_session():
    with Session(engine) as session:
        yield session
