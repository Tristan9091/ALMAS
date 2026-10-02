import { t as createComponent } from "./compiler_C00qYWqz.mjs";
import { S as createAstro, c as renderSlot, d as renderTemplate, f as maybeRenderHead, i as renderComponent, m as addAttribute, p as renderHead } from "./server_XsZuQ5A2.mjs";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/store/useCartStore.ts
var useCartStore = create()(persist((set) => ({
	cart: [],
	addToCart: (producto) => set((state) => {
		const cartKey = `${producto.id}-${producto.varianteId ?? "none"}`;
		if (state.cart.find((item) => item.cartKey === cartKey)) return { cart: state.cart.map((item) => item.cartKey === cartKey ? {
			...item,
			cantidad: item.cantidad + 1
		} : item) };
		return { cart: [...state.cart, {
			...producto,
			cartKey,
			cantidad: 1
		}] };
	}),
	removeFromCart: (cartKey) => set((state) => ({ cart: state.cart.filter((item) => item.cartKey !== cartKey) })),
	increaseQuantity: (cartKey) => set((state) => {
		const itemActual = state.cart.find((item) => item.cartKey === cartKey);
		if (!itemActual) return state;
		if (state.cart.filter((item) => item.id === itemActual.id).reduce((total, item) => total + item.cantidad, 0) >= itemActual.stock) return state;
		return { cart: state.cart.map((item) => item.cartKey === cartKey ? {
			...item,
			cantidad: item.cantidad + 1
		} : item) };
	}),
	decreaseQuantity: (cartKey) => set((state) => ({ cart: state.cart.map((item) => item.cartKey === cartKey ? {
		...item,
		cantidad: item.cantidad - 1
	} : item).filter((item) => item.cantidad > 0) })),
	clearCart: () => set({ cart: [] })
}), { name: "almas-cart" }));
//#endregion
//#region src/components/react/CartButton.jsx
function CartButton() {
	const totalItems = useCartStore((state) => state.cart).reduce((total, item) => total + item.cantidad, 0);
	return /* @__PURE__ */ jsxs("a", {
		href: "/carrito",
		style: {
			display: "flex",
			alignItems: "center",
			gap: "0.4rem",
			border: "1.5px solid #c9a24b",
			color: "#c9a24b",
			padding: "0.5rem 0.8rem",
			borderRadius: "999px",
			textDecoration: "none",
			fontSize: "1.1rem"
		},
		children: ["🛒", totalItems > 0 && /* @__PURE__ */ jsx("span", { children: totalItems })]
	});
}
//#endregion
//#region src/components/react/SearchBar.jsx
function SearchBar() {
	const [query, setQuery] = useState("");
	const handleSubmit = (event) => {
		event.preventDefault();
		const texto = query.trim();
		if (!texto) {
			window.location.href = "/";
			return;
		}
		window.location.href = `/?buscar=${encodeURIComponent(texto)}`;
	};
	return /* @__PURE__ */ jsx("form", {
		onSubmit: handleSubmit,
		style: {
			flex: "0 1 320px",
			display: "flex"
		},
		children: /* @__PURE__ */ jsx("input", {
			type: "search",
			placeholder: "Buscar joyas...",
			value: query,
			onChange: (event) => setQuery(event.target.value),
			style: {
				width: "100%",
				padding: "0.5rem 1.2rem",
				borderRadius: "999px",
				border: "1px solid rgba(253, 240, 220, 0.3)",
				backgroundColor: "rgba(253, 240, 220, 0.08)",
				color: "#fff"
			}
		})
	});
}
//#endregion
//#region src/components/react/AuthStatus.jsx
function AuthStatus() {
	const [usuario, setUsuario] = useState(null);
	useEffect(() => {
		const usuarioGuardado = localStorage.getItem("almas-user");
		if (usuarioGuardado) try {
			setUsuario(JSON.parse(usuarioGuardado));
		} catch {
			localStorage.removeItem("almas-user");
		}
	}, []);
	const cerrarSesion = () => {
		localStorage.removeItem("almas-token");
		localStorage.removeItem("almas-user");
		setUsuario(null);
		window.location.href = "/";
	};
	if (!usuario) return /* @__PURE__ */ jsx("a", {
		href: "/login",
		className: "auth-login",
		children: "Iniciar sesión"
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "auth-status",
		children: [/* @__PURE__ */ jsxs("span", {
			className: "auth-user",
			children: ["Hola, ", usuario.nombre]
		}), /* @__PURE__ */ jsx("button", {
			className: "auth-logout",
			onClick: cerrarSesion,
			children: "Cerrar sesión"
		})]
	});
}
//#endregion
//#region src/components/layout/TopBar.astro
var $$TopBar = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${maybeRenderHead($$result)}<header data-astro-cid-mca63n6t><a class="logo" href="/" data-astro-cid-mca63n6t>ALMĀS</a>${renderComponent($$result, "SearchBar", SearchBar, {
		"client:load": true,
		"data-astro-cid-mca63n6t": true,
		"client:component-hydration": "load",
		"client:component-path": "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/react/SearchBar.jsx",
		"client:component-export": "default"
	})}<div class="header-actions" data-astro-cid-mca63n6t>${renderComponent($$result, "AuthStatus", AuthStatus, {
		"client:load": true,
		"data-astro-cid-mca63n6t": true,
		"client:component-hydration": "load",
		"client:component-path": "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/react/AuthStatus.jsx",
		"client:component-export": "default"
	})}${renderComponent($$result, "CartButton", CartButton, {
		"client:load": true,
		"data-astro-cid-mca63n6t": true,
		"client:component-hydration": "load",
		"client:component-path": "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/react/CartButton.jsx",
		"client:component-export": "default"
	})}</div></header>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/layout/TopBar.astro", void 0);
//#endregion
//#region src/components/layout/Footer.astro
var $$Footer = createComponent(($$result, $$props, $$slots) => {
	const year = (/* @__PURE__ */ new Date()).getFullYear();
	return renderTemplate`${maybeRenderHead($$result)}<footer data-astro-cid-oenwriqq>© ${year} ALMĀS joyería artesanal</footer>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/layout/Footer.astro", void 0);
//#endregion
//#region src/layouts/Layout.astro
createAstro("https://astro.build");
var $$Layout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Layout;
	const { title = "ALMĀS" } = Astro.props;
	return renderTemplate`<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta name="description" content="ALMĀS - Joyería"><title>${title}</title>${renderHead($$result)}</head><body>${renderComponent($$result, "TopBar", $$TopBar, {})}${renderSlot($$result, $$slots["default"])}${renderComponent($$result, "Footer", $$Footer, {})}</body></html>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/layouts/Layout.astro", void 0);
//#endregion
//#region src/components/layout/Sidebar.astro
createAstro("https://astro.build");
var $$Sidebar = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Sidebar;
	const { categorias = [] } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<aside data-astro-cid-cadiappb><a class="home-button" href="/" data-astro-cid-cadiappb>Inicio</a>${categorias.map((cat) => renderTemplate`<a class="category"${addAttribute(`/categoria/${cat.id}`, "href")} data-astro-cid-cadiappb><img${addAttribute(cat.imagenUrl || `https://placehold.co/80x80/c9a24b/8f1268?text=${cat.nombre[0]}`, "src")}${addAttribute(cat.nombre, "alt")} data-astro-cid-cadiappb><span data-astro-cid-cadiappb>${cat.nombre}</span></a>`)}</aside>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/layout/Sidebar.astro", void 0);
//#endregion
//#region src/graphql/client.ts
var ENDPOINT = "http://127.0.0.1:8000/graphql";
async function graphqlRequest(query, variables = {}) {
	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			query,
			variables
		})
	});
	if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
	const json = await response.json();
	if (json.errors) throw new Error(json.errors.map((error) => error.message).join(", "));
	return json.data;
}
//#endregion
export { useCartStore as i, $$Sidebar as n, $$Layout as r, graphqlRequest as t };
