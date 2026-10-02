import { n as __exportAll, t as createComponent } from "./compiler_C00qYWqz.mjs";
import { S as createAstro, a as Fragment, d as renderTemplate, f as maybeRenderHead, i as renderComponent } from "./server_XsZuQ5A2.mjs";
import { n as $$Sidebar, r as $$Layout, t as graphqlRequest } from "./client_CyGnF0vF.mjs";
import { t as $$ProductCard } from "./ProductCard_C2rPYG3N.mjs";
//#region src/pages/categoria/[id].astro
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
	const QUERY_CATEGORIA = `
    query Categoria($id: Int!) {

        categoria(id: $id) {
            id
            nombre

            productos {
                id
                nombre
                precio
                imagenUrl
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
	const categoryId = Number(id);
	let categoria = null;
	let categorias = [];
	let error = null;
	try {
		const data = await graphqlRequest(QUERY_CATEGORIA, { id: categoryId });
		categoria = data.categoria;
		categorias = data.categorias;
	} catch (err) {
		console.error(err);
		error = "No se pudo cargar la categoría.";
	}
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": categoria ? `${categoria.nombre} | ALMĀS` : "Categoría | ALMĀS",
		"data-astro-cid-fxvw3c4x": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="content" data-astro-cid-fxvw3c4x>${renderComponent($$result, "Sidebar", $$Sidebar, {
		"categorias": categorias,
		"data-astro-cid-fxvw3c4x": true
	})}<main data-astro-cid-fxvw3c4x>${error ? renderTemplate`<p class="error" data-astro-cid-fxvw3c4x>${error}</p>` : !categoria ? renderTemplate`<p data-astro-cid-fxvw3c4x>Categoría no encontrada.</p>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<h1 data-astro-cid-fxvw3c4x>${categoria.nombre}</h1>${categoria.productos.length === 0 ? renderTemplate`<p data-astro-cid-fxvw3c4x>No hay productos en esta categoría.</p>` : renderTemplate`<div class="products" data-astro-cid-fxvw3c4x>${categoria.productos.map((producto) => renderTemplate`${renderComponent($$result, "ProductCard", $$ProductCard, {
		"id": producto.id,
		"nombre": producto.nombre,
		"precio": producto.precio,
		"imagenUrl": producto.imagenUrl,
		"data-astro-cid-fxvw3c4x": true
	})}`)}</div>`}` })}`}</main></div>` })}`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/categoria/[id].astro", void 0);
var $$file = "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/pages/categoria/[id].astro";
var $$url = "/categoria/[id]";
//#endregion
//#region \0virtual:astro:page:src/pages/categoria/[id]@_@astro
var page = () => _id__exports;
//#endregion
export { page };
