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

const [subiendoImagen, setSubiendoImagen] = useState(false);
const [errorImagen, setErrorImagen] = useState(null);

/**
 * Ventana para agregar o editar un producto.
 * Si "producto" trae id, edita; si viene vacío, crea uno nuevo.
 * Las reglas (precio > 0, stock >= 0, URL válida...) las vuelve a
 * revisar el backend; aquí solo se avisan antes para ahorrar un viaje.
 */
export default function FormularioProducto({
  producto,
  categorias,
  onCancelar,
  onGuardado,
}) {
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

  const subirImagen = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setErrorImagen(null);

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

    if (!tiposPermitidos.includes(archivo.type)) {
      setErrorImagen("Solo se permiten imagenes JPG, PNG y WebP.");
      e.target.value = "";
      return;
    }

    if (archivo.size > 5 * 1024 * 1024) {
      setErrorImagen("La imagen no puede superar los 5 MB.");
      e.target.value = "";
      return;
    }

    setSubiendoImagen(true);

    try {
      // Utilizar el mismo token que las operaciones GraphQL.
      const token = localStorage.getItem("almas-token");

      if (!token) {
        throw new Error("No hay una sesion iniciada.");
      }

      // Obtener la URL del backend a partir de GraphQL.
      const graphqlUrl =
        import.meta.env.PUBLIC_GRAPHQL_URL ??
        "https://almas-1.onrender.com/graphql";

      const apiUrl = graphqlUrl.replace(/\/graphql\/?$/, "");

      const formulario = new FormData();
      formulario.append("archivo", archivo);

      const respuesta = await fetch(`${apiUrl}/admin/subir-imagen`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formulario,
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          typeof resultado.detail === "string"
            ? resultado.detail
            : "No se pudo subir la imagen.",
        );
      }

      // Guardar automaticamente la URL devuelta por Cloudinary.
      setDatos((anterior) => ({
        ...anterior,
        imagenUrl: resultado.url,
      }));

      setImagenRota(false);
    } catch (error) {
      setErrorImagen(error.message);
    } finally {
      setSubiendoImagen(false);
      e.target.value = "";
    }
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
        : (await graphqlAuthRequest(ACTUALIZAR, { id: producto.id, data }))
            .actualizarProducto;
      onGuardado(resultado, esNuevo);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const urlValida = /^https?:\/\/.+/.test(datos.imagenUrl.trim());

  return (
    <div
      className="modal-fondo"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
    >
      <form
        className="modal"
        onSubmit={guardar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-formulario"
      >
        <header className="modal-encabezado">
          <h2 id="titulo-formulario">
            {esNuevo ? "Nuevo producto" : "Editar producto"}
          </h2>
          <button
            type="button"
            className="admin-cerrar"
            onClick={onCancelar}
            aria-label="Cerrar"
          >
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
                Subir imagen del producto
                <input
                  className="admin-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={subirImagen}
                  disabled={subiendoImagen}
                />
                {subiendoImagen && (
                  <small>Subiendo imagen a Cloudinary...</small>
                )}
                {errorImagen && (
                  <small style={{ color: "red" }}>{errorImagen}</small>
                )}
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
                <img
                  src={datos.imagenUrl.trim()}
                  alt=""
                  onError={() => setImagenRota(true)}
                />
              ) : (
                <div className="vista-previa-vacia">
                  {imagenRota
                    ? "No se pudo cargar la imagen"
                    : "Pega una URL para ver la imagen"}
                </div>
              )}
            </div>
          </div>

          {error && <p className="admin-aviso-linea">{error}</p>}
        </div>

        <footer className="modal-pie">
          <button
            type="button"
            className="admin-boton secundario"
            onClick={onCancelar}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="admin-boton"
            disabled={guardando || subiendoImagen}
          >
            {guardando
              ? "Guardando…"
              : esNuevo
                ? "Agregar producto"
                : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </div>
  );
}
