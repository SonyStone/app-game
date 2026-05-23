import { createMdxShikiCodeBlocks } from "@app-game/vite-plugin-shiki";
import { compile } from "@mdx-js/mdx";
import { readFile } from "node:fs/promises";
//#region src/index.ts
const DEFAULT_QUERY = "markdown2";
const DEFAULT_PREFIX = "\0markdown2:";
const DEFAULT_JSX_IMPORT_SOURCE = "solid-js/h";
function vitePluginMarkdown2(options = {}) {
	const queryKey = options.query ?? DEFAULT_QUERY;
	const prefix = options.prefix ?? DEFAULT_PREFIX;
	const pluginName = options.pluginName ?? "vite-plugin-markdown-2";
	const virtualIdsByFile = /* @__PURE__ */ new Map();
	return {
		name: pluginName,
		enforce: "pre",
		async resolveId(source, importer) {
			if (!hasQuery(source, queryKey)) return null;
			const [requestPath, rawQuery = ""] = source.split("?", 2);
			const query = new URLSearchParams(rawQuery);
			query.delete(queryKey);
			const resolved = await this.resolve(withQuery(requestPath, query), importer, { skipSelf: true });
			if (!resolved || !resolved.id.split("?", 2)[0]?.endsWith(".md")) return null;
			return `${prefix}${withQuery(resolved.id, new URLSearchParams(rawQuery))}`;
		},
		async load(id) {
			if (!id.startsWith(prefix)) return null;
			const [filePath] = id.slice(prefix.length).split("?", 2);
			if (!filePath.endsWith(".md")) return null;
			trackVirtualId(virtualIdsByFile, filePath, id);
			this.addWatchFile(filePath);
			const result = await compile({
				path: filePath,
				value: await readFile(filePath, "utf8")
			}, {
				format: "mdx",
				jsxImportSource: options.jsxImportSource ?? DEFAULT_JSX_IMPORT_SOURCE,
				...options.mdxOptions,
				remarkPlugins: [
					createMdxShikiCodeBlocks({
						themes: options.themes,
						supportedLanguages: options.supportedLanguages,
						defaultLanguage: options.defaultLanguage
					}),
					...options.unwrapParagraphsInComponentChildren === false ? [] : [unwrapParagraphsInComponentChildren],
					...options.remarkPlugins ?? []
				]
			});
			return String(result);
		},
		handleHotUpdate(ctx) {
			const virtualIds = virtualIdsByFile.get(ctx.file);
			if (!virtualIds?.size) return;
			const modules = [...virtualIds].map((virtualId) => ctx.server.moduleGraph.getModuleById(virtualId)).filter((module) => module != null);
			for (const module of modules) ctx.server.moduleGraph.invalidateModule(module);
			return modules;
		}
	};
}
function hasQuery(id, queryKey) {
	const [, rawQuery = ""] = id.split("?", 2);
	if (!rawQuery) return false;
	return new URLSearchParams(rawQuery).has(queryKey);
}
function withQuery(path, query) {
	const queryString = query.toString();
	if (!queryString) return path;
	return `${path}?${queryString}`;
}
function trackVirtualId(virtualIdsByFile, filePath, virtualId) {
	const knownVirtualIds = virtualIdsByFile.get(filePath);
	if (knownVirtualIds) {
		knownVirtualIds.add(virtualId);
		return;
	}
	virtualIdsByFile.set(filePath, new Set([virtualId]));
}
function unwrapParagraphsInComponentChildren() {
	return (tree) => {
		visitMarkdownAst(tree);
	};
}
function visitMarkdownAst(node) {
	if (!node || typeof node !== "object") return;
	const childNodes = Array.isArray(node.children) ? node.children : void 0;
	if (!childNodes) return;
	for (const childNode of childNodes) {
		unwrapSingleParagraphChild(childNode);
		visitMarkdownAst(childNode);
	}
}
function unwrapSingleParagraphChild(node) {
	if (!isMdxJsxElement(node) || node.children?.length !== 1) return;
	const [firstChild] = node.children;
	if (!firstChild?.children || firstChild.type !== "paragraph") return;
	node.children = firstChild.children;
}
function isMdxJsxElement(node) {
	return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}
//#endregion
export { vitePluginMarkdown2 };
