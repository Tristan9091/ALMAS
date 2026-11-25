import { useState, useId } from "react";
import { useCartStore } from "../../store/useCartStore";

export default function AddToCart({ producto }) {
  const addToCart = useCartStore((state) => state.addToCart);
  const cart = useCartStore((state) => state.cart);

  const selectorId = useId();

  const [mensaje, setMensaje] = useState("");

  const [varianteId, setVarianteId] = useState(
    producto.variantes?.[0]?.id ?? null,
  );

  const varianteSeleccionada = producto.variantes?.find(
    (variante) => variante.id === varianteId,
  );

  const cantidadEnCarrito = cart
    .filter((item) => item.id === producto.id)
    .reduce((total, item) => total + item.cantidad, 0);

  const stockDisponible = producto.stock - cantidadEnCarrito;

  const handleAdd = () => {
    if (stockDisponible <= 0) {
      return;
    }

    addToCart({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      imagenUrl: producto.imagenUrl,
      stock: producto.stock,

      varianteId: varianteSeleccionada?.id ?? null,

      variante: varianteSeleccionada
        ? `${varianteSeleccionada.tipo}: ${varianteSeleccionada.valor}`
        : null,
    });

    setMensaje(
      `${producto.nombre} agregado al carrito. Total de unidades de este producto: ${cantidadEnCarrito + 1}.`,
    );
  };

  return (
    <div>
      {producto.variantes?.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
          }}
        >
          <label htmlFor={selectorId}>Variante</label>

          <select
            id={selectorId}
            className="control-producto"
            value={varianteId ?? ""}
            onChange={(event) => setVarianteId(Number(event.target.value))}
            style={{
              display: "block",
              marginTop: "0.5rem",
              padding: "0.7rem",
              borderRadius: "8px",
            }}
          >
            {producto.variantes.map((variante) => (
              <option key={variante.id} value={variante.id}>
                {variante.tipo}: {variante.valor}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        className="control-producto"
        onClick={handleAdd}
        disabled={stockDisponible <= 0}
        style={{
          border: "none",
          borderRadius: "999px",
          padding: "0.8rem 1.5rem",
          backgroundColor: stockDisponible <= 0 ? "#999" : "#8f1268",
          color: "white",
          cursor: stockDisponible <= 0 ? "not-allowed" : "pointer",
        }}
      >
        {stockDisponible <= 0 ? "Sin stock" : "Agregar al carrito"}
      </button>

      <span className="mensaje-accesible" aria-live="polite">
        {mensaje}
      </span>

      <style>{`
        .control-producto:focus-visible {
          outline: 3px solid #870d67;
          outline-offset: 4px;
        }

        .mensaje-accesible {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
}
