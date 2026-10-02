import { t as createComponent } from "./compiler_C00qYWqz.mjs";
import { S as createAstro, d as renderTemplate, f as maybeRenderHead, m as addAttribute } from "./server_XsZuQ5A2.mjs";
//#region src/components/ProductCard.astro
createAstro("https://astro.build");
var $$ProductCard = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$ProductCard;
	const { id, nombre, precio, imagenUrl } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<a class="product-card"${addAttribute(`/producto/${id}`, "href")} data-astro-cid-4fhpls6h><img${addAttribute(imagenUrl || "https://placehold.co/400x400?text=ALMAS", "src")}${addAttribute(nombre, "alt")} data-astro-cid-4fhpls6h><div class="product-info" data-astro-cid-4fhpls6h><h3 data-astro-cid-4fhpls6h>${nombre}</h3><p data-astro-cid-4fhpls6h>$${precio.toLocaleString("es-MX")}</p></div></a>`;
}, "/Users/tristan/Documents/Web2/ALMAS/front-astro/src/components/ProductCard.astro", void 0);
//#endregion
export { $$ProductCard as t };
