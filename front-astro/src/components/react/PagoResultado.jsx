import { useEffect, useState } from "react";
import { useCartStore } from "../../store/useCartStore";
import { graphqlAuthRequest } from "../../graphql/client";

import "../../styles/pago.css";

// Cada cuánto y cuántas veces se vuelve a consultar un pago en proceso.
const INTERVALO_MS = 5000;
const MAX_CONSULTAS = 12;

const ESTADOS_EN_PROCESO = ["pending", "in_process", "authorized"];

/**
 * Página a la que Mercado Pago regresa al comprador.
 *
 * Mercado Pago agrega a la URL datos como payment_id y status, pero
 * cualquiera podría escribirlos a mano. Por eso esta página NO decide
 * nada con ellos: le pide al backend que verifique el pago y muestra
 * lo que el backend responde.
 */
export default function PagoResultado() {
  const clearCart = useCartStore((state) => state.clearCart);

  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [pedidoId, setPedidoId] = useState(null);

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);

    const id = Number(
      parametros.get("pedido") || parametros.get("external_reference"),
    );
    const paymentId =
      parametros.get("payment_id") || parametros.get("collection_id");
    const tienePago = paymentId && /^\d+$/.test(paymentId);

    if (!id) {
      setError("No encontramos el pedido de este pago.");
      setCargando(false);
      return;
    }
    setPedidoId(id);

    if (!localStorage.getItem("almas-token")) {
      setSinSesion(true);
      setCargando(false);
      return;
    }

    let cancelado = false;
    let temporizador = null;
    let consultas = 0;

    const consultar = async () => {
      try {
        // Si Mercado Pago mandó el payment_id, el backend lo verifica con
        // la API de Mercado Pago. Si no, se lee el estado guardado.
        const resultado = tienePago
          ? (
              await graphqlAuthRequest(SINCRONIZAR_PAGO, {
                pedidoId: id,
                paymentId,
              })
            ).sincronizarPago
          : (await graphqlAuthRequest(ESTADO_PEDIDO, { pedidoId: id }))
              .estadoPedido;

        if (cancelado) return;

        setEstado(resultado);
        setError(null);

        if (resultado.estatusPedido === "pagado") {
          clearCart();
          return;
        }

        // Pagos en efectivo o transferencia tardan en acreditarse.
        consultas += 1;
        if (
          ESTADOS_EN_PROCESO.includes(resultado.estadoPago) &&
          consultas < MAX_CONSULTAS
        ) {
          temporizador = setTimeout(consultar, INTERVALO_MS);
        }
      } catch (err) {
        if (cancelado) return;

        if (/token|autenticado/i.test(err.message)) {
          setSinSesion(true);
        } else {
          setError(err.message || "No se pudo verificar el pago.");
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    consultar();

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [clearCart]);

  const reintentarPago = async () => {
    setReintentando(true);
    setError(null);

    try {
      const data = await graphqlAuthRequest(CREAR_PREFERENCIA_PAGO, {
        pedidoId,
      });

      window.location.href = data.crearPreferenciaPago.initPoint;
    } catch (err) {
      setError(err.message || "No se pudo reintentar el pago.");
      setReintentando(false);
    }
  };

  if (cargando) {
    return (
      <div className="pago-resultado">
        <p>Verificando tu pago con Mercado Pago...</p>
      </div>
    );
  }

  if (sinSesion) {
    return (
      <div className="pago-resultado">
        <h2>Inicia sesión para ver tu pedido</h2>

        <p>
          Mercado Pago ya procesó tu pago. Inicia sesión para consultar el
          estado del pedido #{pedidoId}.
        </p>

        <a className="pago-boton" href="/login">
          Iniciar sesión
        </a>
      </div>
    );
  }

  if (error && !estado) {
    return (
      <div className="pago-resultado pago-error">
        <h2>No pudimos verificar tu pago</h2>

        <p>{error}</p>

        <a className="pago-boton" href="/">
          Volver al catálogo
        </a>
      </div>
    );
  }

  const total = `$${estado.total.toLocaleString("es-MX")}`;

  if (estado.estatusPedido === "pagado") {
    return (
      <div className="pago-resultado pago-exito">
        <h2>¡Gracias por tu compra!</h2>

        <p>Tu pago fue aprobado.</p>

        <p>
          Pedido #{estado.pedidoId} · Total {total}
        </p>

        <p>Ya estamos preparando tus joyas para el envío.</p>

        <a className="pago-boton" href="/">
          Seguir comprando
        </a>
      </div>
    );
  }

  if (estado.estatusPedido === "reembolsado") {
    return (
      <div className="pago-resultado">
        <h2>Pago reembolsado</h2>

        <p>
          El pago del pedido #{estado.pedidoId} fue devuelto. Si tienes dudas,
          contáctanos.
        </p>

        <a className="pago-boton" href="/">
          Volver al catálogo
        </a>
      </div>
    );
  }

  if (ESTADOS_EN_PROCESO.includes(estado.estadoPago)) {
    return (
      <div className="pago-resultado pago-pendiente">
        <h2>Tu pago está en proceso</h2>

        <p>
          Pedido #{estado.pedidoId} · Total {total}
        </p>

        <p>
          Si pagaste en efectivo o por transferencia, puede tardar en
          acreditarse. Te confirmaremos cuando Mercado Pago lo apruebe.
        </p>

        <a className="pago-boton" href="/">
          Volver al catálogo
        </a>
      </div>
    );
  }

  // Rechazado, cancelado o sin pago: el pedido sigue pendiente.
  return (
    <div className="pago-resultado pago-error">
      <h2>No se completó el pago</h2>

      <p>
        Pedido #{estado.pedidoId} · Total {total}
      </p>

      <p>
        Tu pedido sigue guardado. Puedes intentar pagar de nuevo con otra
        tarjeta o método de pago.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="pago-acciones">
        <button
          className="pago-boton"
          onClick={reintentarPago}
          disabled={reintentando}
        >
          {reintentando ? "Conectando..." : "Reintentar pago"}
        </button>

        <a className="pago-enlace" href="/carrito">
          Volver al carrito
        </a>
      </div>
    </div>
  );
}

const SINCRONIZAR_PAGO = `
  mutation SincronizarPago($pedidoId: Int!, $paymentId: String!) {
    sincronizarPago(pedidoId: $pedidoId, paymentId: $paymentId) {
      pedidoId
      estatusPedido
      estadoPago
      total
    }
  }
`;

const ESTADO_PEDIDO = `
  query EstadoPedido($pedidoId: Int!) {
    estadoPedido(pedidoId: $pedidoId) {
      pedidoId
      estatusPedido
      estadoPago
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
