import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  cartKey: string;

  id: number;
  nombre: string;
  precio: number;
  imagenUrl?: string | null;

  varianteId?: number | null;
  variante?: string | null;

  cantidad: number;
  stock: number;
}

type NewCartItem = Omit<CartItem, "cantidad" | "cartKey">;

interface CartStore {
  cart: CartItem[];

  addToCart: (producto: NewCartItem) => void;

  removeFromCart: (cartKey: string) => void;

  increaseQuantity: (cartKey: string) => void;

  decreaseQuantity: (cartKey: string) => void;

  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      cart: [],

      addToCart: (producto) =>
        set((state) => {
          const cartKey = `${producto.id}-${producto.varianteId ?? "none"}`;

          const existing = state.cart.find((item) => item.cartKey === cartKey);

          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.cartKey === cartKey
                  ? {
                      ...item,
                      cantidad: item.cantidad + 1,
                    }
                  : item,
              ),
            };
          }

          return {
            cart: [
              ...state.cart,
              {
                ...producto,
                cartKey,
                cantidad: 1,
              },
            ],
          };
        }),

      removeFromCart: (cartKey) =>
        set((state) => ({
          cart: state.cart.filter((item) => item.cartKey !== cartKey),
        })),

      increaseQuantity: (cartKey) =>
        set((state) => {
          const itemActual = state.cart.find(
            (item) => item.cartKey === cartKey,
          );

          if (!itemActual) {
            return state;
          }

          const cantidadTotalProducto = state.cart
            .filter((item) => item.id === itemActual.id)
            .reduce((total, item) => total + item.cantidad, 0);

          if (cantidadTotalProducto >= itemActual.stock) {
            return state;
          }

          return {
            cart: state.cart.map((item) =>
              item.cartKey === cartKey
                ? {
                    ...item,
                    cantidad: item.cantidad + 1,
                  }
                : item,
            ),
          };
        }),

      decreaseQuantity: (cartKey) =>
        set((state) => ({
          cart: state.cart
            .map((item) =>
              item.cartKey === cartKey
                ? {
                    ...item,
                    cantidad: item.cantidad - 1,
                  }
                : item,
            )
            .filter((item) => item.cantidad > 0),
        })),

      clearCart: () => set({ cart: [] }),
    }),

    {
      name: "almas-cart",
    },
  ),
);
