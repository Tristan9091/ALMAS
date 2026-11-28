import { useCallback, useEffect, useRef, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";
import { traducir, rutaLocalizada } from "../../i18n/utils";
import FormularioTarjeta from "./FormularioTarjeta";
import DireccionGeoapify from "./DireccionGeoapify";
import "../../styles/checkout.css";

const PAGOS_REANUDABLES = [null, "rejected", "cancelled"];

export default function Checkout({ idioma = "es" }) {
  const cart = useCartStore((state) => state.cart);
  const clearCart = useCartStore((state) => state.clearCart);

  const t = useCallback((es, en) => traducir(idioma, es, en), [idioma]);

  const ruta = useCallback((path) => rutaLocalizada(path, idioma), [idioma]);

  const moneda = (cantidad) =>
    new Intl.NumberFormat(idioma === "en" ? "en-US" : "es-MX", {
      style: "currency",
      currency: "MXN",
      currencyDisplay: "code",
    }).format(Number(cantidad));

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

  // Bloquea nuevos intentos si el resultado es incierto.
  const [pagoBloqueado, setPagoBloqueado] = useState(false);

  // Evita solicitudes simultáneas de pago.
  const cobroEnCurso = useRef(false);

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
            t(
              "Este pedido ya no se puede pagar desde aquí. Revisa su estado en Mis pedidos.",
              "This order can no longer be paid here. Check its status in My orders.",
            ),
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

        setErrorReanudar(
          idioma === "es"
            ? err?.message || "No se pudo cargar el pedido."
            : "Could not load the order.",
        );
      }
    };

    const verificarSesion = async () => {
      if (!localStorage.getItem("almas-token")) {
        window.location.href = ruta("/login");
        return;
      }

      try {
        const data = await graphqlAuthRequest(ME_QUERY);

        setNombre((actual) => actual || data.me.nombre);
        setEmail((actual) => actual || data.me.email);
      } catch (err) {
        console.error("Error de autenticación:", err);

        localStorage.removeItem("almas-token");
        localStorage.removeItem("almas-user");

        window.location.href = ruta("/login");
        return;
      }

      await reanudarPedido();
      setCheckingAuth(false);
    };

    verificarSesion();
  }, [idioma, ruta, t]);

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
        throw new Error(
          t(
            "No se recibió el número de pedido.",
            "The order number was not received.",
          ),
        );
      }

      setPedido(data.crearPedido);
    } catch (err) {
      console.error("Error al crear pedido:", err);

      setError(
        idioma === "es"
          ? err?.message || "No se pudo crear el pedido."
          : "Could not create the order. Please check your information and try again.",
      );
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
            "El servidor no devolvió un resultado de pago válido.",
          );
        }

        const incidencia = r.estatusPedido.startsWith("incidencia_");

        const rechazado = ["rejected", "cancelled"].includes(r.estadoPago);

        // RECHAZO CONFIRMADO
        if (rechazado && !incidencia && !r.aprobado) {
          const mensaje =
            idioma === "es"
              ? r.mensaje || "Tu pago fue rechazado. Intenta con otra tarjeta."
              : "Your payment was declined or cancelled. Please try another card.";

          sessionStorage.setItem("almas-error-pago", mensaje);

          // Reinicia el Brick para obtener un token nuevo.
          window.location.replace(`${ruta("/checkout")}?pedido=${pedido.id}`);

          return;
        }

        // PAGO APROBADO
        if (r.aprobado && !incidencia && !detallesPedido) {
          clearCart();
        }

        // Aprobado, pendiente o incidencia.
        setResultado(r);
      } catch (err) {
        console.error("Error durante el procesamiento del pago:", err);

        const mensaje = err?.message || "Ocurrió un error al procesar el pago.";

        const esIncierto = mensaje.includes("PAGO_INCIERTO");

        // No permitir otro cobro ante un error no confirmado.
        setPagoBloqueado(true);

        if (esIncierto) {
          setResultado({
            pedidoId: pedido.id,
            aprobado: false,
            estatusPedido: "pendiente",
            estadoPago: "verificacion",
            total: pedido.total,

            mensaje: t(
              "No pudimos confirmar si se realizó el cobro. Conserva el número de pedido y contacta a la tienda antes de hacer otro intento. No vuelvas a pagar este pedido.",
              "We could not confirm whether you were charged. Keep your order number and contact the store. Do not pay for this order again.",
            ),
          });
        } else {
          setError(
            idioma === "es"
              ? "No se pudo completar la solicitud de pago: " +
                  mensaje +
                  " Verifica el estado del pedido antes de volver a pagar."
              : "The payment request could not be completed. Check your order status before attempting another payment.",
          );
        }
      } finally {
        cobroEnCurso.current = false;
      }
    },
    [pedido, clearCart, detallesPedido, pagoBloqueado, idioma, ruta, t],
  );

  if (checkingAuth) {
    return (
      <p role="status">
        {t("Comprobando sesión...", "Checking your session...")}
      </p>
    );
  }

  // RESULTADO DEL PAGO
  if (resultado) {
    const incidencia = resultado.estatusPedido?.startsWith("incidencia_");

    const aprobado = resultado.aprobado && !incidencia;

    const titulo = aprobado
      ? t("¡Gracias por tu compra!", "Thank you for your purchase!")
      : incidencia
        ? t("Tu pago necesita revisión", "Your payment requires review")
        : resultado.estadoPago === "verificacion"
          ? t(
              "No pudimos confirmar tu pago",
              "We could not confirm your payment",
            )
          : t("Tu pago está en revisión", "Your payment is under review");

    const mensajeResultado =
      idioma === "es"
        ? resultado.mensaje
        : aprobado
          ? "Your payment has been approved."
          : resultado.estadoPago === "verificacion"
            ? "We could not confirm whether you were charged. Contact the store before attempting another payment."
            : "Your payment requires verification. Please check your order status and contact the store.";

    return (
      <div className={`success ${aprobado ? "" : "en-revision"}`}>
        <h2>{titulo}</h2>

        <p>{mensajeResultado}</p>

        <p>
          {t("Pedido", "Order")} #{resultado.pedidoId}
          {" · "}
          Total: {moneda(resultado.total)}
        </p>

        {!aprobado && (
          <p className="checkout-nota">
            {t(
              "No realices otro pago de este pedido hasta confirmar su estado con la tienda.",
              "Do not pay for this order again until its status has been confirmed with the store.",
            )}
          </p>
        )}

        <a href={ruta("/mis-pedidos")}>
          {t("Ver mis pedidos", "View my orders")}
        </a>

        <p>
          <a href={ruta("/")}>{t("Volver al catálogo", "Back to catalog")}</a>
        </p>
      </div>
    );
  }

  // ERROR AL REANUDAR
  if (errorReanudar) {
    return (
      <div>
        <p className="error" role="alert">
          {errorReanudar}
        </p>

        <a href={ruta("/mis-pedidos")}>
          {t("Ir a Mis pedidos", "Go to My orders")}
        </a>
      </div>
    );
  }

  // CARRITO VACÍO
  if (cart.length === 0 && !pedido) {
    return (
      <div>
        <p>{t("Tu carrito está vacío.", "Your cart is empty.")}</p>

        <a href={ruta("/")}>{t("Volver al catálogo", "Back to catalog")}</a>
      </div>
    );
  }

  return (
    <div className="checkout">
      {!pedido ? (
        // PASO 1: DATOS DE ENVÍO
        <form onSubmit={continuarAlPago}>
          <p className="checkout-paso">
            {t(
              "Paso 1 de 2 · Datos de envío",
              "Step 1 of 2 · Shipping details",
            )}
          </p>

          <label>
            {t("Nombre", "Name")}

            <input
              type="text"
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </label>

          <label>
            {t("Correo electrónico", "Email address")}

            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <DireccionGeoapify
            idioma={idioma}
            value={direccion}
            onChange={setDireccion}
          />

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading
              ? t("Creando pedido...", "Creating order...")
              : t("Continuar al pago", "Continue to payment")}
          </button>
        </form>
      ) : (
        // PASO 2: TARJETA
        <div className="checkout-pago">
          <p className="checkout-paso">
            {t("Paso 2 de 2 · Pago con tarjeta", "Step 2 of 2 · Card payment")}
          </p>

          <p className="checkout-nota">
            {t(
              `Pedido #${pedido.id}. Paga con tarjeta de crédito o débito. Mercado Pago procesa los datos de tu tarjeta de forma segura; ALMĀS no recibe los datos completos de la tarjeta.`,
              `Order #${pedido.id}. Pay by credit or debit card. Mercado Pago securely processes your card details; ALMĀS does not receive your full card information.`,
            )}
          </p>

          {error && (
            <p className="error checkout-error" role="alert">
              {error}
            </p>
          )}

          {pagoBloqueado ? (
            <div className="checkout-bloqueado">
              <p className="checkout-nota">
                {t(
                  "Por seguridad, el formulario de pago está bloqueado hasta verificar el resultado del intento anterior.",
                  "For your security, the payment form is locked until the previous payment attempt has been verified.",
                )}
              </p>

              <a href={ruta("/mis-pedidos")}>
                {t("Consultar estado del pedido", "Check order status")}
              </a>
            </div>
          ) : (
            <FormularioTarjeta
              idioma={idioma}
              monto={pedido.total}
              email={email}
              onPagar={pagar}
            />
          )}
        </div>
      )}

      {/* RESUMEN */}
      <aside className="order-summary">
        <h2>{t("Resumen", "Order summary")}</h2>

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
              {item.variante ? ` (${item.variante})` : ""}
              {" × "}
              {item.cantidad}
            </span>

            <span>{moneda(item.precio * item.cantidad)}</span>
          </div>
        ))}

        <hr />

        <strong>Total: {moneda(pedido ? pedido.total : totalCarrito)}</strong>
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
