"""
crear_admin.py — Crea un administrador o convierte en admin a un usuario existente.

Uso (desde back/, con el entorno virtual activado):
    python crear_admin.py

Es la ÚNICA forma de crear un admin: no existe ninguna mutación GraphQL
para hacerlo, así que nadie puede volverse admin desde la página web.

También se puede usar al arrancar el servidor, con estas variables de
entorno (útil en Render): ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NOMBRE.
"""

import os
import sys
from getpass import getpass

from sqlalchemy import func
from sqlmodel import Session, select

from auth import hash_password
from database import crear_tablas, engine
from models import Usuario

LONGITUD_MINIMA = 8


def _buscar_por_email(session: Session, email: str):
    return session.exec(
        select(Usuario).where(func.lower(Usuario.email) == email)
    ).first()


def _pedir_password(mensaje: str) -> str:
    # En Git Bash (Windows) getpass puede quedarse trabado, porque esa
    # terminal no es una consola de Windows. Ahí se usa input normal.
    if sys.platform == "win32" and not sys.stdin.isatty():
        return input(f"{mensaje}(se verá en pantalla) ")
    return getpass(mensaje)


def crear_o_promover_admin(email: str, nombre: str = "", password: str = "") -> str:
    """
    Si el correo ya existe, le asigna el rol admin (no cambia su contraseña).
    Si no existe, crea la cuenta como admin con la contraseña dada.
    Regresa "promovido", "creado" o "sin_cambios".
    """
    email = email.strip().lower()

    with Session(engine) as session:
        usuario = _buscar_por_email(session, email)

        if usuario:
            if usuario.rol == "admin" and usuario.activo:
                return "sin_cambios"
            usuario.rol = "admin"
            usuario.activo = True
            session.add(usuario)
            session.commit()
            return "promovido"

        if len(password) < LONGITUD_MINIMA:
            raise ValueError(f"La contraseña debe tener al menos {LONGITUD_MINIMA} caracteres.")

        session.add(Usuario(
            nombre=nombre.strip() or "Administrador",
            email=email,
            password_hash=hash_password(password),
            rol="admin",
        ))
        session.commit()
        return "creado"


def asegurar_admin_desde_entorno() -> None:
    """Se llama al arrancar el servidor. Si no hay variables, no hace nada."""
    email = (os.getenv("ADMIN_EMAIL") or "").strip()
    password = os.getenv("ADMIN_PASSWORD") or ""
    if not email:
        return

    try:
        resultado = crear_o_promover_admin(email, os.getenv("ADMIN_NOMBRE", ""), password)
        if resultado != "sin_cambios":
            print(f"[Admin] Cuenta {email}: {resultado}")
    except ValueError as error:
        print(f"[Admin] No se pudo preparar la cuenta {email}: {error}")


def main() -> None:
    crear_tablas()  # Asegura que la columna "rol" exista.

    print("=== Crear administrador de ALMĀS ===\n")
    email = input("Correo: ").strip().lower()
    if "@" not in email:
        sys.exit("Correo no válido.")

    with Session(engine) as session:
        existente = _buscar_por_email(session, email)

    if existente:
        if existente.rol == "admin":
            print(f"{existente.nombre} ya es administrador.")
            return
        respuesta = input(f"{existente.nombre} ya existe como cliente. ¿Hacerlo admin? (s/n): ")
        if respuesta.strip().lower() != "s":
            print("Cancelado. No se hizo ningún cambio.")
            return
        crear_o_promover_admin(email)
        print(f"Listo: {existente.nombre} ahora es administrador.")
        return

    nombre = input("Nombre: ").strip()
    # Normalmente la contraseña no se muestra mientras se escribe.
    password = _pedir_password(f"Contraseña (mínimo {LONGITUD_MINIMA} caracteres): ")
    if password != _pedir_password("Repite la contraseña: "):
        sys.exit("Las contraseñas no coinciden. No se hizo ningún cambio.")

    try:
        crear_o_promover_admin(email, nombre, password)
    except ValueError as error:
        sys.exit(str(error))

    print(f"Listo: se creó la cuenta de administrador {email}.")


if __name__ == "__main__":
    main()
