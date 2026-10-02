import { useState } from "react";

import { useCartStore } from "../../store/useCartStore";
import { graphqlRequest } from "../../graphql/client";

import "../../styles/checkout.css";

export default function Checkout() {
  const cart = useCartStore((state) => state.cart);

  const clearCart = useCartStore((state) => state.clearCart);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pedido, setPedido] = useState(null);

  const total = cart.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const data = await graphqlRequest(CREAR_PEDIDO, {
        data: {
          nombreComprador: nombre,
          emailComprador: email,
          direccionEnvio: direccion,

          detalles: cart.map((item) => ({
            productoId: item.id,
            varianteId: item.varianteId ?? null,
            cantidad: item.cantidad,
            precioUnitario: item.precio,
          })),
        },
      });

      setPedido(data.crearPedido);

      clearCart();
    } catch (err) {
      console.error(err);

      setError("No se pudo realizar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  if (pedido) {
    return (
      <div className="success">
        <h2>¡Pedido realizado!</h2>

        <p>Pedido #{pedido.id}</p>

        <p>Comprador: {pedido.nombreComprador}</p>

        <p>Estado: {pedido.estatus}</p>

        <p>Total: ${pedido.total.toLocaleString("es-MX")}</p>

        <a href="/">Volver al catálogo</a>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div>
        <p>Tu carrito está vacío.</p>

        <a href="/">Volver al catálogo</a>
      </div>
    );
  }

  return (
    <div className="checkout">
      <form onSubmit={handleSubmit}>
        <label>
          Nombre
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>

        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Dirección de envío
          <textarea
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Procesando..." : "Realizar pedido"}
        </button>
      </form>

      <aside className="order-summary">
        <h2>Resumen</h2>

        {cart.map((item) => (
          <div className="summary-item" key={item.id}>
            <span>
              {item.nombre} × {item.cantidad}
            </span>

            <span>
              ${(item.precio * item.cantidad).toLocaleString("es-MX")}
            </span>
          </div>
        ))}

        <hr />

        <strong>Total: ${total.toLocaleString("es-MX")}</strong>
      </aside>
    </div>
  );
}

const CREAR_PEDIDO = `
    mutation CrearPedido($data: PedidoInput!) {

        crearPedido(data: $data) {
            id
            nombreComprador
            estatus
            total
        }

    }
`;
