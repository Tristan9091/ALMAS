# ALMĀS — Práctica P3-2: PWA instalable

**Materia / Práctica:** Programación Web — P3-2 (PWA instalable)

## Descripción

ALMĀS es una tienda de joyería (prácticas 1 y 2). En esta práctica se convirtió el frontend en una
**PWA instalable**: tiene icono propio, nombre, ventana independiente (sin barra del navegador) y
los colores de la marca, definidos en el manifiesto de aplicación.

El offline real queda fuera de esta práctica y se aborda en la P3-3.

## Estructura

```
ALMAS-unificado/
├── back/          # API FastAPI + GraphQL (Strawberry) + SQLite
└── front-astro/   # Frontend Astro 7 (+ React) — aquí está la PWA
    ├── astro.config.mjs        # integración @vite-pwa/astro + manifiesto
    ├── public/icons/           # iconos de la PWA
    └── src/layouts/Layout.astro  # <link rel="manifest">, theme-color, apple-touch-icon
```

## Actualizaciones

1. **Plugin instalado:** `@vite-pwa/astro` (v2) como dependencia de desarrollo.
2. **`astro.config.mjs`:** se agregó la integración `AstroPWAIntegration` con el manifiesto:

   | Campo              | Valor                                 |
   | ------------------ | ------------------------------------- |
   | `name`             | ALMĀS Joyería                         |
   | `short_name`       | ALMĀS                                 |
   | `id`               | `/`                                   |
   | `start_url`        | `/`                                   |
   | `scope`            | `/`                                   |
   | `display`          | `standalone`                          |
   | `theme_color`      | `#8f1268` (morado de la marca)        |
   | `background_color` | `#ffffff`                             |
   | `icons`            | 192×192, 512×512 y 512×512 _maskable_ |

3. **Iconos** en `front-astro/public/icons/`:
   - `icon-192.png` (192×192)
   - `icon-512.png` (512×512)
   - `icon-maskable-512.png` (512×512, logo dentro del 80 % central; fondo a sangre para el recorte de Android)
4. **`Layout.astro`:** se agregaron `<link rel="manifest">`, `<meta name="theme-color">`,
   `apple-touch-icon` y `initial-scale=1` en el viewport.

## Colores (tokens de diseño)

Tomados de `src/styles/global.css`:

| Uso en la PWA                 | Token              | Valor     |
| ----------------------------- | ------------------ | --------- |
| `theme_color` e icono (fondo) | morado de la marca | `#8f1268` |
| `background_color`            | fondo              | `#ffffff` |
| Logo del icono                | dorado             | `#c9a24b` |

## Cómo correr el proyecto

### Backend

```powershell
cd ALMAS-unificado\back
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Requiere un archivo `back/.env` con las variables propias (JWT, Mercado Pago, etc.). **No se incluye en la entrega.**

### Frontend

```powershell
cd ALMAS-unificado\front-astro
npm install
npm run dev
```

Abrir `http://localhost:4321`. Si se quiere usar el backend local, crear `front-astro/.env` con:

```
PUBLIC_GRAPHQL_URL=http://127.0.0.1:8000/graphql
```

Sin esa variable, el frontend usa el backend publicado en Render.

## Cómo verificar la PWA

1. Abrir `http://localhost:4321/manifest.webmanifest`: debe mostrar el JSON del manifiesto.
2. En Chrome: **F12 → Application → Manifest**. Deben verse el nombre, `start_url`, `display: standalone`,
   los colores y los tres iconos, sin errores.
3. En la barra de direcciones aparece el icono de **instalar**; al aceptarlo, la tienda se abre en su
   propia ventana.
4. Nota: las versiones recientes de Lighthouse ya no incluyen la categoría PWA; la evidencia de
   instalabilidad se toma del panel Manifest y de la instalación real de la app.
