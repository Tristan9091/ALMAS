import { useCartStore } from "../../store/useCartStore";
import { rutaLocalizada, traducir } from "../../i18n/utils";

export default function CartButton({ idioma = "es" }) {
  const cart = useCartStore((state) => state.cart);

  const totalItems = cart.reduce((total, item) => total + item.cantidad, 0);

  return (
    <a
      href={rutaLocalizada("/carrito", idioma)}
      aria-label={traducir(
        idioma,
        `Carrito: ${totalItems} productos`,
        `Cart: ${totalItems} items`,
      )}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        gap: "0.4rem",
        border: "1.5px solid #c9a24b",
        color: "#c9a24b",
        minHeight: "40px",
        padding: "0.5rem 0.8rem",
        borderRadius: "999px",
        textDecoration: "none",
        fontSize: "1.1rem",
      }}
    >
      <span aria-hidden="true">🛒</span>

      {totalItems > 0 && <span>{totalItems}</span>}
    </a>
  );
}
