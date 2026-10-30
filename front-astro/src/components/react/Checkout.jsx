import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";
import FormularioTarjeta from "./FormularioTarjeta";

import "../../styles/checkout.css";

/**
 * Checkout en dos pasos de ALMĀS:
 * 1. Se crea un pedido con los precios validados por el servidor.
 * 2. Mercado Pago tokeniza la tarjeta y el servidor procesa el cobro.
 *
 * Si no se sabe con certeza qué ocurrió con un cobro, NO se permite
 * enviar otra tarjeta desde este mismo pedido.
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
  const [pedido, setPedido] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [detallesPedido, setDetallesPedido] = useState(null); // productos del pedido retomado
  const [errorReanudar, setErrorReanudar] = useState(null);

  // Evita que el Brick envíe dos pagos antes de actualizar React.
  const cobroEnCurso = useRef(false);

  useEffect(() => {
    const mensaje = sessionStorage.getItem("almas-error-pago");

    if (mensaje) {
      setError(mensaje);
      sessionStorage.removeItem("almas-error-pago");
    }
  }, []);

  useEffect(() => {
    const mensaje = sessionStorage.getItem("almas-error-pago");

    if (mensaje) {
      setError(mensaje);
      sessionStorage.removeItem("almas-error-pago");
    }
  }, []);

  const totalCarrito = cart.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  useEffect(() => {
    // Un pedido solo se puede retomar si no hay un cobro abierto.
    const PAGOS_REANUDABLES = [null, "rejected", "cancelled"];

    const reanudarPedido = async () => {
      const id = Number(
        new URLSearchParams(window.location.search).get("pedido"),
      );
      if (!id) return;

      try {
        const data = await graphqlAuthRequest(MIS_PEDIDOS_QUERY);
        const existente = data.misPedidos.find((p) => p.id === id);

        if (
          !existente ||
          existente.estatus !== "pendiente" ||
          !PAGOS_REANUDABLES.includes(existente.estadoPago ?? null)
        ) {
          setErrorReanudar(
            "Este pedido ya no se puede pagar desde aquí. Revisa su estado en Mis pedidos.",
          );
          return;
        }

        setPedido({ id: existente.id, total: existente.total });
        setDetallesPedido(existente.detalles);
      } catch (err) {
        console.error(err);
        setErrorReanudar(err.message || "No se pudo cargar el pedido.");
      }
    };

    const verificarSesion = async () => {
      if (!localStorage.getItem("almas-token")) {
        window.location.href = "/login";
        return;
      }

      try {
        const data = await graphqlAuthRequest(ME_QUERY);
        setNombre((actual) => actual || data.me.nombre);
        setEmail((actual) => actual || data.me.email);
      } catch (err) {
        console.error(err);
        localStorage.removeItem("almas-token");
        localStorage.removeItem("almas-user");
        window.location.href = "/login";
        return;
      }

      await reanudarPedido();
      setCheckingAuth(false);
    };

    verificarSesion();
  }, []);

  // Paso 1. El backend calcula el total definitivo y crea el pedido.
  const continuarAlPago = async (event) => {
    event.preventDefault();
    if (loading || pedido) return;

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

      if (!data?.crearPedido?.id) {
        throw new Error("No se recibió el número de pedido.");
      }

      setPedido(data.crearPedido);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo crear el pedido.");
    } finally {
      setLoading(false);
    }
  };

  // Paso 2. El Card Payment Brick entrega un token; nunca datos de tarjeta.
  const pagar = useCallback(
    async (tarjeta) => {
      if (!pedido || cobroEnCurso.current) return;

      cobroEnCurso.current = true;
      setError(null);

      try {
        const data = await graphqlAuthRequest(PAGAR_PEDIDO, {
          data: { pedidoId: pedido.id, ...tarjeta },
        });
        const r = data?.pagarPedido;

        if (!r || !r.estadoPago || !r.estatusPedido) {
          throw new Error(
            "El servidor no devolvió un resultado de pago válido.",
          );
        }

        const incidencia = r.estatusPedido.startsWith("incidencia_");
        const rechazado = ["rejected", "cancelled"].includes(r.estadoPago);

        // Solo se puede repetir el cobro si existe un rechazo explícito
        // y el pedido no quedó marcado con una incidencia.

        if (rechazado && !incidencia && !r.aprobado) {
          const mensaje =
            r.mensaje || "Tu pago fue rechazado. Intenta con otra tarjeta.";

          sessionStorage.setItem("almas-error-pago", mensaje);

          // Reiniciar el formulario de Mercado Pago sin crear otro pedido.
          window.location.replace(`/checkout?pedido=${pedido.id}`);
          return;
        }

        // Confirmado, pendiente, incierto o incidencia: ocultar el Brick
        // para que no se intente otro cobro sobre el mismo pedido.
        if (r.aprobado && !incidencia && !detallesPedido) {
          clearCart();
        }
        setResultado(r);
      } catch (err) {
        console.error("No se pudo confirmar el cobro:", err);

        // Una excepción GraphQL o de red no demuestra que la solicitud
        // NO llegó a Mercado Pago. No invitamos a pagar de nuevo.
        setResultado({
          aprobado: false,
          pedidoId: pedido.id,
          estatusPedido: "pendiente",
          estadoPago: "verificacion",
          total: pedido.total,
          mensaje:
            "No pudimos confirmar si se realizó el cobro. " +
            "Conserva el número de pedido y contacta a la tienda " +
            "antes de hacer otro intento. No vuelvas a pagar este pedido.",
        });
      } finally {
        cobroEnCurso.current = false;
      }
    },
    [pedido, clearCart, detallesPedido],
  );

  if (checkingAuth) {
    return <p>Comprobando sesión...</p>;
  }

  if (resultado) {
    const incidencia = resultado.estatusPedido?.startsWith("incidencia_");
    const aprobado = resultado.aprobado && !incidencia;
    const titulo = aprobado
      ? "¡Gracias por tu compra!"
      : incidencia
        ? "Tu pago necesita revisión"
        : resultado.estadoPago === "verificacion"
          ? "No pudimos confirmar tu pago"
          : "Tu pago está en revisión";

    return (
      <div className={`success ${aprobado ? "" : "en-revision"}`}>
        <h2>{titulo}</h2>
        <p>{resultado.mensaje}</p>
        <p>
          Pedido #{resultado.pedidoId} · Total $
          {Number(resultado.total).toLocaleString("es-MX")}
        </p>
        {!aprobado && (
          <p className="checkout-nota">
            No realices otro pago de este pedido hasta confirmar su estado con
            la tienda.
          </p>
        )}
        <a href="/">Volver al catálogo</a>
      </div>
    );
  }

  if (errorReanudar) {
    return (
      <div>
        <p className="error">{errorReanudar}</p>
        <a href="/mis-pedidos">Ir a Mis pedidos</a>
      </div>
    );
  }

  if (cart.length === 0 && !pedido) {
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
            {loading ? "Creando pedido..." : "Continuar al pago"}
          </button>
        </form>
      ) : (
        <div className="checkout-pago">
          <p className="checkout-paso">Paso 2 de 2 · Pago con tarjeta</p>
          <p className="checkout-nota">
            Pedido #{pedido.id}. Paga con tarjeta de crédito o débito. Los datos
            de tu tarjeta los procesa Mercado Pago de forma segura; ALMĀS nunca
            los ve.
          </p>

          {error && <p className="error checkout-error">{error}</p>}

          <FormularioTarjeta
            monto={pedido.total}
            email={email}
            onPagar={pagar}
          />
        </div>
      )}

      <aside className="order-summary">
        <h2>Resumen</h2>

        {(detallesPedido
          ? detallesPedido.map((d, i) => ({
              cartKey: `p-${i}`,
              nombre: d.nombreProducto,
              variante: d.variante,
              cantidad: d.cantidad,
              precio: d.precioUnitario,
            }))
          : cart
        ).map((item) => (
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

        <strong>
          Total: $
          {(pedido ? pedido.total : totalCarrito).toLocaleString("es-MX")}
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
const MIS_PEDIDOS_QUERY = `
  query {
    misPedidos {
      id
      estatus
      estadoPago
      total
      detalles { nombreProducto variante cantidad precioUnitario }
    }
  }
`;
