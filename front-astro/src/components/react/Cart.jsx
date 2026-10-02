import { useCartStore } from "../../store/useCartStore";
import "../../styles/cart.css";

export default function Cart() {
  const cart = useCartStore((state) => state.cart);

  const increaseQuantity = useCartStore((state) => state.increaseQuantity);

  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);

  const removeFromCart = useCartStore((state) => state.removeFromCart);

  const clearCart = useCartStore((state) => state.clearCart);

  const total = cart.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  if (cart.length === 0) {
    return (
      <div>
        <p>Tu carrito está vacío.</p>

        <a href="/">Volver al catálogo</a>
      </div>
    );
  }

  return (
    <div>
      <div className="cart-list">
        {cart.map((item) => (
          <article className="cart-item" key={item.cartKey}>
            <img
              src={item.imagenUrl || "https://placehold.co/100x100?text=ALMAS"}
              alt={item.nombre}
            />

            <div className="info">
              <h3>{item.variante && <p>{item.variante}</p>}</h3>

              <p>${item.precio.toLocaleString("es-MX")}</p>
            </div>

            <div className="quantity">
              <button onClick={() => decreaseQuantity(item.cartKey)}>−</button>

              <span>{item.cantidad}</span>

              <button onClick={() => increaseQuantity(item.cartKey)}>+</button>
            </div>

            <p className="subtotal">
              ${(item.precio * item.cantidad).toLocaleString("es-MX")}
            </p>

            <button
              className="remove"
              onClick={() => removeFromCart(item.cartKey)}
            >
              Eliminar
            </button>
          </article>
        ))}
      </div>

      <div className="summary">
        <h2>Total: ${total.toLocaleString("es-MX")}</h2>

        <div className="actions">
          <button className="clear" onClick={clearCart}>
            Vaciar carrito
          </button>

          <a className="checkout" href="/checkout">
            Continuar al checkout
          </a>
        </div>
      </div>
    </div>
  );
}
