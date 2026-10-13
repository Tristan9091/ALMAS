import { useEffect, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";

import "../../styles/checkout.css";

export default function Checkout() {
  const cart = useCartStore((state) => state.cart);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Si el pedido se creó pero falló Mercado Pago, se reintenta
  // con el mismo pedido en lugar de crear uno nuevo.
  const [pedidoId, setPedidoId] = useState(null);

  const [checkingAuth, setCheckingAuth] = useState(true);

  // Total aproximado para mostrar. El total que se cobra lo calcula el backend.
  const total = cart.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  useEffect(() => {
    const verificarSesion = async () => {
      const token = localStorage.getItem("almas-token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      try {
        const data = await graphqlAuthRequest(ME_QUERY);

        // Rellena los datos del comprador con su cuenta.
        setNombre((actual) => actual || data.me.nombre);
        setEmail((actual) => actual || data.me.email);

        setCheckingAuth(false);
      } catch (err) {
        console.error(err);

        localStorage.removeItem("almas-token");
        localStorage.removeItem("almas-user");

        window.location.href = "/login";
      }
    };

    verificarSesion();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      let idPedido = pedidoId;

      // 1. Crear el pedido (el backend valida precios y stock).
      if (!idPedido) {
        const data = await graphqlAuthRequest(CREAR_PEDIDO, {
          data: {
            nombreComprador: nombre,
            emailComprador: email,
            direccionEnvio: direccion,

            detalles: cart.map((item) => ({
              productoId: item.id,
              varianteId: item.varianteId ?? null,
              cantidad: item.cantidad,
            })),
          },
        });

        idPedido = data.crearPedido.id;
        setPedidoId(idPedido);
      }

      // 2. Pedir a nuestro backend el link de pago de Mercado Pago.
      const pago = await graphqlAuthRequest(CREAR_PREFERENCIA_PAGO, {
        pedidoId: idPedido,
      });

      // 3. Llevar al comprador a Mercado Pago.
      // El carrito NO se vacía aquí: se vacía cuando el pago se confirma.
      window.location.href = pago.crearPreferenciaPago.initPoint;
    } catch (err) {
      console.error(err);

      setError(err.message || "No se pudo iniciar el pago.");
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return <p>Comprobando sesión...</p>;
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
            disabled={pedidoId !== null}
            required
          />
        </label>

        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pedidoId !== null}
            required
          />
        </label>

        <label>
          Dirección de envío
          <textarea
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            disabled={pedidoId !== null}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading
            ? "Conectando con Mercado Pago..."
            : pedidoId
              ? "Reintentar pago"
              : "Pagar con Mercado Pago"}
        </button>

        <p className="checkout-nota">
          Serás redirigido a Mercado Pago para pagar de forma segura con
          tarjeta, efectivo o transferencia.
        </p>
      </form>

      <aside className="order-summary">
        <h2>Resumen</h2>

        {cart.map((item) => (
          <div className="summary-item" key={item.cartKey}>
            <span>
              {item.nombre}
              {item.variante ? ` (${item.variante})` : ""} × {item.cantidad}
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
      total
    }
  }
`;

const CREAR_PREFERENCIA_PAGO = `
  mutation CrearPreferenciaPago($pedidoId: Int!) {
    crearPreferenciaPago(pedidoId: $pedidoId) {
      initPoint
    }
  }
`;

const ME_QUERY = `
  query {
    me {
      id
      nombre
      email
    }
  }
`;
