import { n as __exportAll, t as createComponent } from "./compiler_C00qYWqz.mjs";
import { S as createAstro, d as renderTemplate, f as maybeRenderHead, i as renderComponent, m as addAttribute } from "./server_XsZuQ5A2.mjs";
import { i as useCartStore, n as $$Sidebar, r as $$Layout, t as graphqlRequest } from "./client_CyGnF0vF.mjs";
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/components/react/AddToCart.jsx
function AddToCart({ producto }) {
	const addToCart = useCartStore((state) => state.addToCart);
	const cart = useCartStore((state) => state.cart);
	const [varianteId, setVarianteId] = useState(producto.variantes?.[0]?.id ?? null);
	const varianteSeleccionada = producto.variantes?.find((variante) => variante.id === varianteId);
	const cantidadEnCarrito = cart.filter((item) => item.id === producto.id).reduce((total, item) => total + item.cantidad, 0);
	const stockDisponible = producto.stock - cantidadEnCarrito;
	const handleAdd = () => {
		if (stockDisponible <= 0) return;
		addToCart({
			id: producto.id,
			nombre: producto.nombre,
			precio: producto.precio,
			imagenUrl: producto.imagenUrl,
			stock: producto.stock,
			varianteId: varianteSeleccionada?.id ?? null,
			variante: varianteSeleccionada ? `${varianteSeleccionada.tipo}: ${varianteSeleccionada.valor}` : null
		});
	};
	return /* @__PURE__ */ jsxs("div", { children: [producto.variantes?.length > 0 && /* @__PURE__ */ jsxs("div", {
		style: { marginBottom: "1.5rem" },
		children: [/* @__PURE__ */ jsx("label", { children: "Variante" }), /* @__PURE__ */ jsx("select", {
			value: varianteId ?? "",
			onChange: (event) => setVarianteId(Number(event.target.value)),
			style: {
				display: "block",
				marginTop: "0.5rem",
				padding: "0.7rem",
				borderRadius: "8px"
			},
			children: producto.variantes.map((variante) => /* @__PURE__ */ jsxs("option", {
				value: variante.id,
				children: [
					variante.tipo,
					": ",
					variante.valor
				]
			}, variante.id))
		})]
	}), /* @__PURE__ */ jsx("button", {
		type: "button",
		onClick: handleAdd,
		disabled: stockDisponible <= 0,
		style: {
			border: "none",
			borderRadius: "999px",
			padding: "0.8rem 1.5rem",
			backgroundColor: stockDisponible <= 0 ? "#999" : "#8f1268",
			color: "white",
			cursor: stockDisponible <= 0 ? "not-allowed" : "pointer"
		},
		children: stockDisponible <= 0 ? "Sin stock" : "Agregar al carrito"
	})] });
}
//#endregion
//#region src/pages/producto/[id].astro
var _id__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Id,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Id = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Id;
	const QUERY_PRODUCTO = `
    query Producto($id: Int!) {

        product(id: $id) {
            id
            nombre
            descripcion
            precio
            imagenUrl
            stock

            variantes {
                id
                tipo
                valor
            }
        }

        categorias {
            id
            nombre
            imagenUrl
        }
    }
`;
	const { id } = Astro.params;
	const productId = Number(id);
	let producto = null;
	let categorias = [];
	let error = null;
	try {
		const data = await graphqlRequest(QUERY_PRODUCTO, { id: productId });
		producto = data.product;
		categorias = data.categorias;
	} catch (err) {
		console.error(err);
		error = "No se pudo cargar el producto.";
	}
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": producto ? `${producto.nombre} | ALMĀS` : "Producto | ALMĀS",
		"data-astro-cid-lqmott66": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="content" data-astro-cid-lqmott66>${renderComponent($$result, "Sidebar", $$Sidebar, {
		"categorias": categorias,
		"data-astro-cid-lqmott66": true
	})}<main data-astro-cid-lqmott66>${error ? renderTemplate`<p class="error" data-astro-cid-lqmott66>${error}</p>` : !producto ? renderTemplate`<p data-astro-cid-lqmott66>Producto no encontrado.</p>` : renderTemplate`<div class="product" data-astro-cid-lqmott66><div class="image-container" data-astro-cid-lqmott66><img${addAttribute(producto.imagenUrl || "https://placehold.co/600x600?text=ALMAS", "src")}${addAttribute(producto.nombre, "alt")} data-astro-cid-lqmott66></div><div class="info" data-astro-cid-lqmott66><h1 data-astro-cid-lqmott66>${producto.nombre}</h1><p class="description" data-astro-cid-lqmott66>${producto.descripcion}</p><p class="price" data-astro-cid-lqmott66>$${producto.precio.toLocaleString("es-MX")}</p><p data-astro-cid-lqmott66>Stock disponible: ${producto.stock}</p>${producto.variantes.length > 0 && renderTemplate`<div class="variants" data-astro-cid-lqmott66><h3 data-astro-cid-lqmott66>Variantes</h3>${producto.variantes.map((variante) => renderTemplate`<div class="variant" data-astro-cid-lqmott66><strong data-astro-cid-lqmott66>${variante.tipo}:</strong>${" "}${variante.valor}</div>`)}</div>`}${renderComponent($$result, "AddToCart", AddToCart, {
		"client:load": true,
		"producto": {
			id: producto.id,
			nombre: producto.nombre,
			precio: producto.precio,
			imagenUrl: producto.imagenUrl,
			stock: producto.stock,
			variantes: producto.variantes
		},
		"data-astro-cid-lqmott66": true,
		"client:component-hydration": "load",
		"client:component-path": "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/react/AddToCart.jsx",
		"client:component-export": "default"
	})}</div></div>`}</main></div>` })}`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/producto/[id].astro", void 0);
var $$file = "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/producto/[id].astro";
var $$url = "/producto/[id]";
//#endregion
//#region \0virtual:astro:page:src/pages/producto/[id]@_@astro
var page = () => _id__exports;
//#endregion
export { page };
