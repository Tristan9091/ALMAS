import { create } from "zustand";

export const useAppStore = create((set) => ({
  //estado general de la app
  screen: "home", //pantalla actual
  selectedCategoryId: null, //id de la categoria seleccionada
  selectedProductId: null, //id del producto seleccionado
  cart: [], //productos en el carrito

  goHome: () =>
    set({ screen: "home", selectedCategoryId: null, selectedProductId: null }),
  goToCategory: (categoryId) =>
    set({
      screen: "category",
      selectedCategoryId: categoryId,
      selectedProductId: null,
    }),
  goToProduct: (productId) =>
    set({ screen: "product", selectedProductId: productId }),
  goToCart: () => set({ screen: "cart" }),
  goToCheckout: () => set({ screen: "checkout" }),
  addToCart: (producto) =>
    set((state) => ({ cart: [...state.cart, producto] })),
}));
