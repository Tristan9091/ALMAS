import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";
import FormularioTarjeta from "./FormularioTarjeta";
import DireccionGeoapify from "./DireccionGeoapify";
import "../../styles/checkout.css";

/**
 * Checkout en dos pasos:
 * 1. Crear el pedido con precios validados por el backend.
 * 2. Tokenizar la tarjeta y solicitar el cobro a Mercado Pago.
 *
 * Nunca se permite repetir un cobro cuando su resultado
 * no ha sido confirmado.
 */

const PAGOS_REANUDABLES = [null, "rejected", "cancelled"];

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

  const [detallesPedido, setDetallesPedido] = useState(null);
  const [errorReanudar, setErrorReanudar] = useState(null);

  // Bloquea el formulario si no se conoce el resultado del cobro.
  const [pagoBloqueado, setPagoBloqueado] = useState(false);

  // Evita solicitudes simultaneas desde el Brick.
  const cobroEnCurso = useRef(false);

  // Recupera un mensaje de rechazo despues de reiniciar el Brick.
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
    const reanudarPedido = async () => {
      const id = Number(
        new URLSearchParams(window.location.search).get("pedido"),
      );

      if (!id) return;

      try {
        const data = await graphqlAuthRequest(MIS_PEDIDOS_QUERY);

        const existente = data?.misPedidos?.find((p) => p.id === id);

        if (
          !existente ||
          existente.estatus !== "pendiente" ||
          !PAGOS_REANUDABLES.includes(existente.estadoPago ?? null)
        ) {
          setErrorReanudar(
            "Este pedido ya no se puede pagar desde aqui. " +
              "Revisa su estado en Mis pedidos.",
          );
          return;
        }

        setPedido({
          id: existente.id,
          total: existente.total,
        });

        setDetallesPedido(existente.detalles);
      } catch (err) {
        console.error("Error al reanudar pedido:", err);

        setErrorReanudar(err?.message || "No se pudo cargar el pedido.");
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
        console.error("Error de autenticacion:", err);

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

  // PASO 1: CREAR PEDIDO
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
        throw new Error("No se recibio el numero de pedido.");
      }

      setPedido(data.crearPedido);
    } catch (err) {
      console.error("Error al crear pedido:", err);

      setError(err?.message || "No se pudo crear el pedido.");
    } finally {
      setLoading(false);
    }
  };

  // PASO 2: PROCESAR PAGO
  const pagar = useCallback(
    async (tarjeta) => {
      if (!pedido || cobroEnCurso.current || pagoBloqueado) {
        return;
      }

      cobroEnCurso.current = true;
      setError(null);

      try {
        const data = await graphqlAuthRequest(PAGAR_PEDIDO, {
          data: {
            pedidoId: pedido.id,
            ...tarjeta,
          },
        });

        const r = data?.pagarPedido;

        if (!r || !r.estadoPago || !r.estatusPedido) {
          throw new Error(
            "El servidor no devolvio un resultado de pago valido.",
          );
        }

        const incidencia = r.estatusPedido.startsWith("incidencia_");

        const rechazado = ["rejected", "cancelled"].includes(r.estadoPago);

        // RECHAZO CONFIRMADO
        // Se puede reintentar sobre el mismo pedido.
        if (rechazado && !incidencia && !r.aprobado) {
          const mensaje =
            r.mensaje || "Tu pago fue rechazado. Intenta con otra tarjeta.";

          sessionStorage.setItem("almas-error-pago", mensaje);

          // Reinicia el Brick para obtener un token nuevo.
          window.location.replace(`/checkout?pedido=${pedido.id}`);

          return;
        }

        // PAGO APROBADO
        if (r.aprobado && !incidencia && !detallesPedido) {
          clearCart();
        }

        // Aprobado, pendiente o incidencia.
        // Se oculta el formulario de pago.
        setResultado(r);
      } catch (err) {
        console.error("Error durante el procesamiento del pago:", err);

        const mensaje = err?.message || "Ocurrio un error al procesar el pago.";

        const esIncierto = mensaje.includes("PAGO_INCIERTO");

        // Nunca habilitar otro cobro solamente porque
        // la solicitud GraphQL haya fallado.
        setPagoBloqueado(true);

        if (esIncierto) {
          // El backend identifico un resultado incierto.
          setResultado({
            pedidoId: pedido.id,
            aprobado: false,
            estatusPedido: "pendiente",
            estadoPago: "verificacion",
            total: pedido.total,
            mensaje:
              "No pudimos confirmar si se realizo el cobro. " +
              "Conserva el numero de pedido y contacta " +
              "a la tienda antes de hacer otro intento. " +
              "No vuelvas a pagar este pedido.",
          });
        } else {
          // Error no clasificado: mostramos el motivo
          // sin afirmar que el pago fue rechazado.
          setError(
            "No se pudo completar la solicitud de pago: " +
              mensaje +
              " Verifica el estado del pedido antes de volver a pagar.",
          );
        }
      } finally {
        cobroEnCurso.current = false;
      }
    },
    [pedido, clearCart, detallesPedido, pagoBloqueado],
  );

  if (checkingAuth) {
    return <p>Comprobando sesión...</p>;
  }

  // RESULTADO DEL PAGO
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

        <a href="/mis-pedidos">Ver mis pedidos</a>

        <p>
          <a href="/">Volver al catálogo</a>
        </p>
      </div>
    );
  }

  // ERROR AL REANUDAR
  if (errorReanudar) {
    return (
      <div>
        <p className="error">{errorReanudar}</p>

        <a href="/mis-pedidos">Ir a Mis pedidos</a>
      </div>
    );
  }

  // CARRITO VACIO
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
        // PASO 1: DATOS DE ENVIO
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

          <DireccionGeoapify value={direccion} onChange={setDireccion} />
          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Creando pedido..." : "Continuar al pago"}
          </button>
        </form>
      ) : (
        // PASO 2: TARJETA
        <div className="checkout-pago">
          <p className="checkout-paso">Paso 2 de 2 · Pago con tarjeta</p>

          <p className="checkout-nota">
            Pedido #{pedido.id}. Paga con tarjeta de crédito o débito. Los datos
            de tu tarjeta los procesa Mercado Pago de forma segura; ALMĀS nunca
            los ve.
          </p>

          {error && (
            <p className="error checkout-error" role="alert">
              {error}
            </p>
          )}

          {pagoBloqueado ? (
            <div className="checkout-bloqueado">
              <p className="checkout-nota">
                Por seguridad, el formulario de pago está bloqueado hasta
                verificar el resultado del intento anterior.
              </p>

              <a href="/mis-pedidos">Consultar estado del pedido</a>
            </div>
          ) : (
            <FormularioTarjeta
              monto={pedido.total}
              email={email}
              onPagar={pagar}
            />
          )}
        </div>
      )}

      {/* RESUMEN */}
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

// GRAPHQL

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
      detalles {
        nombreProducto
        variante
        cantidad
        precioUnitario
      }
    }
  }
`;
