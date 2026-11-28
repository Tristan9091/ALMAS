import { useEffect, useRef, useState } from "react";
import { traducir } from "../../i18n/utils";

const SDK_URL = "https://sdk.mercadopago.com/js/v2";
const CONTENEDOR = "cardPaymentBrick_container";

const PUBLIC_KEY = import.meta.env.PUBLIC_MP_PUBLIC_KEY;

// Carga el SDK de Mercado Pago una sola vez.
function cargarSdk() {
  if (window.MercadoPago) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${SDK_URL}"]`);

    const script = existente ?? document.createElement("script");

    script.addEventListener("load", () => resolve());

    script.addEventListener("error", () =>
      reject(new Error("No se pudo cargar Mercado Pago.")),
    );

    if (!existente) {
      script.src = SDK_URL;
      document.head.appendChild(script);
    }
  });
}

export default function FormularioTarjeta({
  monto,
  email,
  onPagar,
  idioma = "es",
}) {
  const controlador = useRef(null);
  const onPagarRef = useRef(onPagar);

  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);

  const t = (es, en) => traducir(idioma, es, en);

  onPagarRef.current = onPagar;

  useEffect(() => {
    const texto = (es, en) => traducir(idioma, es, en);

    setEstado("cargando");
    setError(null);

    if (!PUBLIC_KEY) {
      setEstado("error");

      setError(
        texto(
          "El servicio de pago no está configurado.",
          "The payment service is not configured.",
        ),
      );

      console.error("Falta configurar PUBLIC_MP_PUBLIC_KEY.");

      return;
    }

    let cancelado = false;

    cargarSdk()
      .then(async () => {
        if (cancelado) return;

        const mp = new window.MercadoPago(PUBLIC_KEY, {
          locale: idioma === "en" ? "en-US" : "es-MX",
        });

        const brick = await mp.bricks().create("cardPayment", CONTENEDOR, {
          initialization: {
            amount: monto,
            payer: { email },
          },

          customization: {
            paymentMethods: {
              maxInstallments: 1,
            },

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
            onReady: () => {
              if (!cancelado) {
                setEstado("listo");
              }
            },

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

              if (!cancelado) {
                setError(
                  texto(
                    "Hubo un problema con el formulario de pago. Recarga la página.",
                    "There was a problem with the payment form. Reload the page.",
                  ),
                );
              }
            },
          },
        });

        if (cancelado) {
          brick.unmount();
          return;
        }

        controlador.current = brick;
      })
      .catch((err) => {
        if (cancelado) return;

        console.error("Mercado Pago:", err);

        setEstado("error");

        setError(
          texto(
            "No se pudo cargar el formulario de pago.",
            "Could not load the payment form.",
          ),
        );
      });

    return () => {
      cancelado = true;

      controlador.current?.unmount();
      controlador.current = null;
    };
  }, [monto, email, idioma]);

  return (
    <div className="formulario-tarjeta">
      {estado === "cargando" && (
        <p className="checkout-nota" role="status">
          {t(
            "Cargando formulario de pago seguro…",
            "Loading secure payment form…",
          )}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div id={CONTENEDOR} />
    </div>
  );
}
