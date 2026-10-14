import { useEffect, useRef, useState } from "react";
import { graphqlAuthRequest } from "../../graphql/client";

const CREAR = `
  mutation CrearProducto($data: ProductoInput!) {
    crearProducto(data: $data) { id nombre }
  }
`;

const ACTUALIZAR = `
  mutation ActualizarProducto($id: Int!, $data: ProductoInput!) {
    actualizarProducto(id: $id, data: $data) { id nombre }
  }
`;

/**
 * Ventana para agregar o editar un producto.
 * Si "producto" trae id, edita; si viene vacío, crea uno nuevo.
 * Las reglas (precio > 0, stock >= 0, URL válida...) las vuelve a
 * revisar el backend; aquí solo se avisan antes para ahorrar un viaje.
 */
export default function FormularioProducto({ producto, categorias, onCancelar, onGuardado }) {
  const esNuevo = !producto.id;
  const primerCampo = useRef(null);

  const [datos, setDatos] = useState({
    nombre: producto.nombre ?? "",
    descripcion: producto.descripcion ?? "",
    precio: producto.precio ?? "",
    stock: producto.stock ?? "",
    categoriaId: producto.categoriaId ?? categorias[0]?.id ?? "",
    imagenUrl: producto.imagenUrl ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [imagenRota, setImagenRota] = useState(false);

  // Enfocar el primer campo y cerrar con Escape.
  useEffect(() => {
    primerCampo.current?.focus();
    const alTeclear = (e) => e.key === "Escape" && onCancelar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCancelar]);

  const cambiar = (campo) => (e) => {
    setDatos({ ...datos, [campo]: e.target.value });
    if (campo === "imagenUrl") setImagenRota(false);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const data = {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      precio: Number(datos.precio),
      stock: Number.parseInt(datos.stock, 10),
      categoriaId: Number(datos.categoriaId),
      imagenUrl: datos.imagenUrl,
    };

    try {
      const resultado = esNuevo
        ? (await graphqlAuthRequest(CREAR, { data })).crearProducto
        : (await graphqlAuthRequest(ACTUALIZAR, { id: producto.id, data })).actualizarProducto;
      onGuardado(resultado, esNuevo);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const urlValida = /^https?:\/\/.+/.test(datos.imagenUrl.trim());

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <form
        className="modal"
        onSubmit={guardar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-formulario"
      >
        <header className="modal-encabezado">
          <h2 id="titulo-formulario">{esNuevo ? "Nuevo producto" : "Editar producto"}</h2>
          <button type="button" className="admin-cerrar" onClick={onCancelar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="modal-cuerpo">
          <div className="formulario-columnas">
            <div className="formulario-campos">
              <label className="campo">
                Nombre
                <input
                  ref={primerCampo}
                  className="admin-input"
                  value={datos.nombre}
                  onChange={cambiar("nombre")}
                  required
                  maxLength={120}
                />
              </label>

              <label className="campo">
                Descripción
                <textarea
                  className="admin-input"
                  value={datos.descripcion}
                  onChange={cambiar("descripcion")}
                  required
                  rows={3}
                />
              </label>

              <div className="campo-fila">
                <label className="campo">
                  Precio (MXN)
                  <input
                    className="admin-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={datos.precio}
                    onChange={cambiar("precio")}
                    required
                  />
                </label>

                <label className="campo">
                  Stock
                  <input
                    className="admin-input"
                    type="number"
                    min="0"
                    step="1"
                    value={datos.stock}
                    onChange={cambiar("stock")}
                    required
                  />
                </label>
              </div>

              <label className="campo">
                Categoría
                <select
                  className="admin-input"
                  value={datos.categoriaId}
                  onChange={cambiar("categoriaId")}
                  required
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campo">
                URL de la imagen
                <input
                  className="admin-input"
                  type="url"
                  placeholder="https://…"
                  value={datos.imagenUrl}
                  onChange={cambiar("imagenUrl")}
                  required
                />
              </label>
            </div>

            <div className="vista-previa">
              <p>Vista previa</p>
              {urlValida && !imagenRota ? (
                <img src={datos.imagenUrl.trim()} alt="" onError={() => setImagenRota(true)} />
              ) : (
                <div className="vista-previa-vacia">
                  {imagenRota ? "No se pudo cargar la imagen" : "Pega una URL para ver la imagen"}
                </div>
              )}
            </div>
          </div>

          {error && <p className="admin-aviso-linea">{error}</p>}
        </div>

        <footer className="modal-pie">
          <button type="button" className="admin-boton secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="admin-boton" disabled={guardando}>
            {guardando ? "Guardando…" : esNuevo ? "Agregar producto" : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </div>
  );
}
