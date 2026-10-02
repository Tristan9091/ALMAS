import { useState } from "react";
import { useCartStore } from "../../store/useCartStore";

export default function AddToCart({ producto }) {
  const addToCart = useCartStore((state) => state.addToCart);

  const cart = useCartStore((state) => state.cart);

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
  };

  return (
    <div>
      {producto.variantes?.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
          }}
        >
          <label>Variante</label>

          <select
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
    </div>
  );
}
