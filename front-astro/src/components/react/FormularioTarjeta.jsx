import { useEffect, useRef, useState } from "react";

const SDK_URL = "https://sdk.mercadopago.com/js/v2";
const CONTENEDOR = "cardPaymentBrick_container";

// La Public Key es pública: puede ir en el navegador sin riesgo.
// Se configura en front-astro/.env como PUBLIC_MP_PUBLIC_KEY.
const PUBLIC_KEY = import.meta.env.PUBLIC_MP_PUBLIC_KEY;

/** Carga el SDK de Mercado Pago una sola vez. */
function cargarSdk() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${SDK_URL}"]`);
    const script = existente ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Mercado Pago.")));
    if (!existente) {
      script.src = SDK_URL;
      document.head.appendChild(script);
    }
  });
}

/**
 * Formulario de tarjeta de Mercado Pago (Card Payment Brick).
 *
 * El número de tarjeta se escribe en campos que controla Mercado Pago.
 * Al enviar, Mercado Pago entrega un "token" y este componente se lo pasa
 * a onPagar(). La tarjeta nunca pasa por el código de ALMĀS.
 *
 * onPagar debe regresar una Promise: el formulario muestra "procesando"
 * mientras espera.
 */
export default function FormularioTarjeta({ monto, email, onPagar }) {
  const controlador = useRef(null);
  const onPagarRef = useRef(onPagar);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);

  onPagarRef.current = onPagar;

  useEffect(() => {
    if (!PUBLIC_KEY) {
      setEstado("error");
      setError("Falta configurar PUBLIC_MP_PUBLIC_KEY en front-astro/.env.");
      return;
    }

    let cancelado = false;

    cargarSdk()
      .then(async () => {
        if (cancelado) return;
        const mp = new window.MercadoPago(PUBLIC_KEY, { locale: "es-MX" });
        controlador.current = await mp.bricks().create("cardPayment", CONTENEDOR, {
          initialization: {
            amount: monto,
            payer: { email },
          },
          customization: {
            // Pago en una sola exhibición (sin meses sin intereses).
            paymentMethods: { maxInstallments: 1 },
            visual: {
              style: {
                customVariables: {
                  baseColor: "#8f1268",
                  borderRadiusMedium: "10px",
                },
              },
            },
          },
          callbacks: {
            onReady: () => !cancelado && setEstado("listo"),
            onSubmit: (formData, additionalData) => {
              const metodo = formData.payment_method_id;
              const tipo =
                additionalData?.paymentTypeId ??
                formData.payment_type_id ??
                (metodo?.startsWith("deb") ? "debit_card" : "credit_card");

              return onPagarRef.current({
                token: formData.token,
                metodoPago: metodo,
                tipoPago: tipo,
                cuotas: Number(formData.installments) || 1,
                emailPagador: formData.payer?.email || email,
              });
            },
            onError: (err) => {
              console.error("Mercado Pago:", err);
              if (!cancelado) setError("Hubo un problema con el formulario de pago. Recarga la página.");
            },
          },
        });
      })
      .catch((err) => {
        if (cancelado) return;
        setEstado("error");
        setError(err.message);
      });

    return () => {
      cancelado = true;
      controlador.current?.unmount();
      controlador.current = null;
    };
  }, [monto, email]);

  return (
    <div className="formulario-tarjeta">
      {estado === "cargando" && <p className="checkout-nota">Cargando formulario de pago seguro…</p>}
      {error && <p className="error">{error}</p>}
      <div id={CONTENEDOR} />
    </div>
  );
}
