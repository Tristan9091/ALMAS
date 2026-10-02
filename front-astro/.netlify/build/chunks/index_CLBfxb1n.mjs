import { n as __exportAll, t as createComponent } from "./compiler_C00qYWqz.mjs";
import { S as createAstro, d as renderTemplate, f as maybeRenderHead, i as renderComponent } from "./server_XsZuQ5A2.mjs";
import { n as $$Sidebar, r as $$Layout, t as graphqlRequest } from "./client_CyGnF0vF.mjs";
import { t as $$ProductCard } from "./ProductCard_C2rPYG3N.mjs";
//#region src/components/layout/Hero.astro
var $$Hero = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${maybeRenderHead($$result)}<section class="hero" data-astro-cid-jyyvf762><h1 data-astro-cid-jyyvf762>ALMĀS</h1><p class="hero-logo" data-astro-cid-jyyvf762>aljawahiriu</p><p class="hero-phrase" data-astro-cid-jyyvf762>you can't buy happiness but you can buy jewellery and that's pretty close</p></section>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/layout/Hero.astro", void 0);
//#endregion
//#region src/pages/index.astro
var pages_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	prerender: () => false,
	url: () => ""
});
createAstro("https://astro.build");
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Index;
	const QUERY_HOME = `
    query {
        categorias {
            id
            nombre
            imagenUrl
        }

        products {
            id
            nombre
            precio
            imagenUrl
        }
    }
`;
	let categorias = [];
	let productos = [];
	let error = null;
	try {
		const data = await graphqlRequest(QUERY_HOME);
		categorias = data.categorias;
		productos = data.products;
	} catch (err) {
		console.error(err);
		error = "No se pudo cargar el catálogo.";
	}
	const buscar = Astro.url.searchParams.get("buscar")?.trim().toLowerCase() ?? "";
	const productosFiltrados = buscar ? productos.filter((producto) => producto.nombre.toLowerCase().includes(buscar)) : productos;
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": "ALMĀS",
		"data-astro-cid-lcdefpme": true
	}, { "default": ($$result) => renderTemplate`${renderComponent($$result, "Hero", $$Hero, { "data-astro-cid-lcdefpme": true })}${maybeRenderHead($$result)}<div class="content" data-astro-cid-lcdefpme>${renderComponent($$result, "Sidebar", $$Sidebar, {
		"categorias": categorias,
		"data-astro-cid-lcdefpme": true
	})}<main data-astro-cid-lcdefpme><h2 data-astro-cid-lcdefpme>${buscar ? `Resultados para "${buscar}"` : "Catálogo"}</h2>${error ? renderTemplate`<p class="error" data-astro-cid-lcdefpme>${error}</p>` : productosFiltrados.length === 0 ? renderTemplate`<p data-astro-cid-lcdefpme>No hay productos disponibles.</p>` : renderTemplate`<div class="products" data-astro-cid-lcdefpme>${productosFiltrados.map((producto) => renderTemplate`${renderComponent($$result, "ProductCard", $$ProductCard, {
		"id": producto.id,
		"nombre": producto.nombre,
		"precio": producto.precio,
		"imagenUrl": producto.imagenUrl,
		"data-astro-cid-lcdefpme": true
	})}`)}</div>`}</main></div>` })}`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/index.astro", void 0);
var $$file = "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/index.astro";
//#endregion
//#region \0virtual:astro:page:src/pages/index@_@astro
var page = () => pages_exports;
//#endregion
export { page };
