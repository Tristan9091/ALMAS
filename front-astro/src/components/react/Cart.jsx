import { useCartStore } from "../../store/useCartStore";
import { traducir, rutaLocalizada } from "../../i18n/utils";
import "../../styles/cart.css";

export default function Cart({ idioma = "es" }) {
  const cart = useCartStore((state) => state.cart);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);

  const t = (es, en) => traducir(idioma, es, en);

  const moneda = (cantidad) =>
    new Intl.NumberFormat(idioma === "en" ? "en-US" : "es-MX", {
      style: "currency",
      currency: "MXN",
      currencyDisplay: "code",
    }).format(cantidad);

  const total = cart.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  if (cart.length === 0) {
    return (
      <div className="carrito-ui">
        <p>{t("Tu carrito está vacío.", "Your cart is empty.")}</p>

        <a href={rutaLocalizada("/", idioma)}>
          {t("Volver al catálogo", "Back to catalog")}
        </a>
      </div>
    );
  }

  return (
    <div className="carrito-ui">
      <div className="cart-list">
        {cart.map((item) => (
          <article className="cart-item" key={item.cartKey}>
            <img
              src={item.imagenUrl || "https://placehold.co/100x100?text=ALMAS"}
              alt={item.nombre}
            />

            <div className="info">
              <h2>{item.nombre}</h2>

              {item.variante && <p>{item.variante}</p>}

              <p>{moneda(item.precio)}</p>
            </div>

            <div className="quantity">
              <button
                type="button"
                aria-label={t("Disminuir cantidad", "Decrease quantity")}
                onClick={() => decreaseQuantity(item.cartKey)}
              >
                −
              </button>

              <span>{item.cantidad}</span>

              <button
                type="button"
                aria-label={t("Aumentar cantidad", "Increase quantity")}
                onClick={() => increaseQuantity(item.cartKey)}
              >
                +
              </button>
            </div>

            <p className="subtotal">{moneda(item.precio * item.cantidad)}</p>

            <button
              type="button"
              className="remove"
              onClick={() => removeFromCart(item.cartKey)}
            >
              {t("Eliminar", "Remove")}
            </button>
          </article>
        ))}
      </div>

      <div className="summary">
        <h2>Total: {moneda(total)}</h2>

        <div className="actions">
          <button type="button" className="clear" onClick={clearCart}>
            {t("Vaciar carrito", "Clear cart")}
          </button>

          <a className="checkout" href={rutaLocalizada("/checkout", idioma)}>
            {t("Continuar al checkout", "Proceed to checkout")}
          </a>
        </div>
      </div>
    </div>
  );
}
