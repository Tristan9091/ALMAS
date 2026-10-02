import { useCartStore } from "../../store/useCartStore";

export default function CartButton() {
  const cart = useCartStore((state) => state.cart);

  const totalItems = cart.reduce((total, item) => total + item.cantidad, 0);

  return (
    <a
      href="/carrito"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        border: "1.5px solid #c9a24b",
        color: "#c9a24b",
        padding: "0.5rem 0.8rem",
        borderRadius: "999px",
        textDecoration: "none",
        fontSize: "1.1rem",
      }}
    >
      🛒
      {totalItems > 0 && <span>{totalItems}</span>}
    </a>
  );
}
