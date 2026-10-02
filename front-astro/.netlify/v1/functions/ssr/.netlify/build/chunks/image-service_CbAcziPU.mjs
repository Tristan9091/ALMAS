import { $ as AstroUserError } from "./errors-data_C6ad0_sd.mjs";
import { i as isESMImportedImage, n as baseService, r as verifyOptions } from "./generic_-v8dgZ3f.mjs";
//#region node_modules/@astrojs/netlify/dist/image-service.js
var SUPPORTED_FORMATS = [
	"avif",
	"jpg",
	"png",
	"webp"
];
var QUALITY_NAMES = {
	low: 25,
	mid: 50,
	high: 90,
	max: 100
};
var FIT_MAP = {
	contain: "contain",
	cover: "cover",
	fill: "fill",
	inside: "contain",
	outside: "cover",
	"scale-down": "contain"
};
function removeLeadingForwardSlash(path) {
	return path.startsWith("/") ? path.substring(1) : path;
}
var image_service_default = {
	getURL(options) {
		if (isESMImportedImage(options.src) && options.src.format === "svg") return options.src.src;
		const query = new URLSearchParams();
		const fileSrc = isESMImportedImage(options.src) ? removeLeadingForwardSlash(options.src.src) : options.src;
		query.set("url", fileSrc);
		if (options.format) query.set("fm", options.format);
		if (options.width) query.set("w", `${options.width}`);
		if (options.height) query.set("h", `${options.height}`);
		if (options.quality) query.set("q", `${options.quality}`);
		if (options.fit) {
			const netlifyFit = FIT_MAP[options.fit];
			if (netlifyFit) query.set("fit", netlifyFit);
		}
		return `/.netlify/images?${query}`;
	},
	getHTMLAttributes: baseService.getHTMLAttributes,
	getSrcSet: baseService.getSrcSet,
	validateOptions(options) {
		verifyOptions(options);
		if (options.format && !SUPPORTED_FORMATS.includes(options.format)) throw new AstroUserError(`Unsupported image format "${options.format}"`, `Use one of ${SUPPORTED_FORMATS.join(", ")} instead.`);
		if (options.quality) {
			options.quality = typeof options.quality === "string" ? QUALITY_NAMES[options.quality] : options.quality;
			if (options.quality < 1 || options.quality > 100) throw new AstroUserError(`Invalid quality for picture "${options.src}"`, "Quality needs to be between 1 and 100.");
		}
		return options;
	}
};
//#endregion
export { image_service_default as default };
