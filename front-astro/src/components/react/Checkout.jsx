import { useCallback, useEffect, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";
import FormularioTarjeta from "./FormularioTarjeta";

import "../../styles/checkout.css";

/**
 * Checkout en dos pasos, sin salir de ALMĀS (Checkout API de Mercado Pago):
 *   1. Datos de envío → el backend crea el pedido y calcula el total real.
 *   2. Tarjeta → Mercado Pago la convierte en token, el backend cobra y
 *      responde al momento si se aprobó.
 */
export default function Checkout() {
  const cart = useCartStore((state) => state.cart);
  const clearCart = useCartStore((state) => state.clearCart);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pedido creado en el paso 1: { id, total }
  const [pedido, setPedido] = useState(null);
  // Resultado del cobro: { aprobado, estadoPago, mensaje, ... }
  const [resultado, setResultado] = useState(null);

  // Total aproximado para el resumen. El que se cobra lo calcula el backend.
  const totalCarrito = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  useEffect(() => {
    const verificarSesion = async () => {
      if (!localStorage.getItem("almas-token")) {
        window.location.href = "/login";
        return;
      }
      try {
        const data = await graphqlAuthRequest(ME_QUERY);
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

  // Paso 1: crear el pedido (el backend valida precios y stock).
  const continuarAlPago = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
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
      setPedido(data.crearPedido);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo crear el pedido.");
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: cobrar con el token que entrega el formulario de Mercado Pago.
  const pagar = useCallback(
    async (tarjeta) => {
      setError(null);
      try {
        const data = await graphqlAuthRequest(PAGAR_PEDIDO, {
          data: { pedidoId: pedido.id, ...tarjeta },
        });
        const r = data.pagarPedido;

        if (r.aprobado || r.estadoPago === "in_process" || r.estadoPago === "pending") {
          if (r.aprobado) clearCart();
          setResultado(r);
        } else {
          // Rechazado: el formulario se queda para intentar con otra tarjeta.
          setError(r.mensaje);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || "No se pudo procesar el pago.");
      }
    },
    [pedido, clearCart],
  );

  if (checkingAuth) {
    return <p>Comprobando sesión...</p>;
  }

  if (resultado) {
    const aprobado = resultado.aprobado;
    return (
      <div className={`success ${aprobado ? "" : "en-revision"}`}>
        <h2>{aprobado ? "¡Gracias por tu compra!" : "Tu pago está en revisión"}</h2>
        <p>{resultado.mensaje}</p>
        <p>
          Pedido #{resultado.pedidoId} · Total ${resultado.total.toLocaleString("es-MX")}
        </p>
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
      {!pedido ? (
        <form onSubmit={continuarAlPago}>
          <p className="checkout-paso">Paso 1 de 2 · Datos de envío</p>

          <label>
            Nombre
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>

          <label>
            Correo electrónico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Dirección de envío
            <textarea value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Creando pedido..." : "Continuar al pago"}
          </button>
        </form>
      ) : (
        <div className="checkout-pago">
          <p className="checkout-paso">Paso 2 de 2 · Pago con tarjeta</p>
          <p className="checkout-nota">
            Pedido #{pedido.id}. Paga con tarjeta de crédito o débito. Los datos de tu tarjeta
            los procesa Mercado Pago de forma segura; ALMĀS nunca los ve.
          </p>

          {error && <p className="error checkout-error">{error}</p>}

          <FormularioTarjeta monto={pedido.total} email={email} onPagar={pagar} />
        </div>
      )}

      <aside className="order-summary">
        <h2>Resumen</h2>

        {cart.map((item) => (
          <div className="summary-item" key={item.cartKey}>
            <span>
              {item.nombre}
              {item.variante ? ` (${item.variante})` : ""} × {item.cantidad}
            </span>
            <span>${(item.precio * item.cantidad).toLocaleString("es-MX")}</span>
          </div>
        ))}

        <hr />

        <strong>
          Total: ${(pedido ? pedido.total : totalCarrito).toLocaleString("es-MX")}
        </strong>
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

const PAGAR_PEDIDO = `
  mutation PagarPedido($data: PagoTarjetaInput!) {
    pagarPedido(data: $data) {
      pedidoId
      aprobado
      estatusPedido
      estadoPago
      mensaje
      total
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
