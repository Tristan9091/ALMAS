# ALMĀS — Backend (GraphQL)

Backend del e-commerce de joyería artesanal ALMĀS. Expone un único endpoint GraphQL
construido con **FastAPI + Strawberry**, sobre una base de datos **SQLite** manejada
con **SQLModel**.

## Requisitos

- Python 3.10+

## Instalación

```bash
cd back
python -m venv venv

# Activar entorno virtual
venv\Scripts\activate        # Windows (PowerShell/cmd)
source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
```

## Levantar la base de datos

Si ya existe `db.sqlite3`, este paso no es necesario (los datos ya están sembrados).
Si empiezas de cero o quieres reiniciar la base:

```bash
python main.py     # crea las tablas
python seed.py      # inserta categorías, productos y variantes de prueba
```

> También se incluye `db.sql`, un dump del esquema y los datos actuales por si
> necesitas reconstruir la base en otro motor o entorno.

## Correr el servidor

```bash
uvicorn main:app --reload
```

El servidor queda disponible en `http://127.0.0.1:8000`.

## Explorar la API

Abre en tu navegador el playground interactivo (GraphiQL):

```
http://127.0.0.1:8000/graphql
```

### Ejemplo — consultar catálogo

```graphql
query {
  products {
    id
    nombre
    precio
    variantes { tipo valor }
  }
}
```

### Ejemplo — registrar un pedido

```graphql
mutation {
  crearPedido(data: {
    nombreComprador: "Juan Pérez"
    emailComprador: "juan@mail.com"
    direccionEnvio: "Calle Falsa 123"
    detalles: [{ productoId: 1, cantidad: 1, precioUnitario: 899.0 }]
  }) {
    id
    estatus
    total
  }
}
```

## Estructura del proyecto

```
back/
├── main.py         # arranca FastAPI + monta GraphQL en /graphql + CORS
├── models.py        # entidades SQLModel (tablas)
├── database.py      # conexión y creación de tablas
├── schema.py         # tipos y resolvers GraphQL (Query + Mutation)
├── seed.py           # datos de prueba
├── db.sql            # dump del esquema + datos
└── requirements.txt
```

Ver `reporte-p6.md` (carpeta de reportes) para el diagrama de entidades y el detalle
completo del esquema GraphQL.