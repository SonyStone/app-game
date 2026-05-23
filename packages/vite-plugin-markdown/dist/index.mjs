import { createShikiRenderer, normalizeShikiLanguage } from "@app-game/vite-plugin-shiki";
import { createMarkdownExit } from "markdown-exit";
import { readFile } from "node:fs/promises";
//#region src/index.ts
const DEFAULT_QUERY = "markdown";
const DEFAULT_PREFIX = "\0markdown:";
function vitePluginMarkdown(options = {}) {
	const queryKey = options.query ?? DEFAULT_QUERY;
	const prefix = options.prefix ?? DEFAULT_PREFIX;
	const pluginName = options.pluginName ?? "vite-plugin-markdown";
	let markdownRendererPromise;
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
			if (!resolved) return null;
			return `${prefix}${withQuery(resolved.id, new URLSearchParams(rawQuery))}`;
		},
		async load(id) {
			if (!id.startsWith(prefix)) return null;
			const [filePath, rawQuery = ""] = id.slice(prefix.length).split("?", 2);
			const query = new URLSearchParams(rawQuery);
			trackVirtualId(virtualIdsByFile, filePath, id);
			this.addWatchFile(filePath);
			const markdown = await readFile(filePath, "utf8");
			const renderer = await (markdownRendererPromise ??= createRenderer(options));
			const html = await renderer.renderAsync(markdown);
			const exports = [`export const markdown = ${JSON.stringify(markdown)};`, `export const html = ${JSON.stringify(html)};`];
			if (query.has("blocks")) {
				const blocks = await createMarkdownBlocks(markdown, renderer);
				exports.push(`export const blocks = ${JSON.stringify(blocks)};`);
			}
			exports.push(`export default ${JSON.stringify(html)};`);
			return exports.join("\n");
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
async function createRenderer(options) {
	const shikiRenderer = createShikiRenderer({
		themes: options.themes,
		supportedLanguages: options.supportedLanguages,
		defaultLanguage: options.defaultLanguage
	});
	const renderer = createMarkdownExit({
		...options.markdownOptions,
		highlight: options.markdownOptions?.highlight ?? (async (code, language) => {
			return (await shikiRenderer.highlight(code, {
				language: normalizeShikiLanguage(language),
				theme: options.theme
			})).html;
		})
	});
	await options.configureMarkdown?.(renderer);
	return renderer;
}
async function createMarkdownBlocks(markdown, renderer) {
	const tokens = renderer.parse(markdown, {});
	const blocks = [];
	for (let index = 0; index < tokens.length;) {
		const token = tokens[index];
		if (token.level !== 0) {
			index += 1;
			continue;
		}
		if (token.type === "fence" || token.type === "code_block") {
			blocks.push(await createCodeBlock(token, renderer));
			index += 1;
			continue;
		}
		if (token.nesting === 1) {
			const nextIndex = findBlockEnd(tokens, index);
			const blockTokens = tokens.slice(index, nextIndex);
			blocks.push(await createContainerBlock(blockTokens, renderer));
			index = nextIndex;
			continue;
		}
		if (token.type === "html_block") {
			blocks.push({
				type: "html",
				html: await renderer.renderer.renderAsync([token], renderer.options, {})
			});
			index += 1;
			continue;
		}
		index += 1;
	}
	return blocks;
}
function findBlockEnd(tokens, startIndex) {
	let depth = 0;
	for (let index = startIndex; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token.level !== 0 && index !== startIndex) continue;
		if (token.nesting === 1) depth += 1;
		else if (token.nesting === -1) {
			depth -= 1;
			if (depth === 0) return index + 1;
		} else if (index !== startIndex && depth === 0) return index;
	}
	return tokens.length;
}
async function createContainerBlock(blockTokens, renderer) {
	const [openToken, inlineToken] = blockTokens;
	const html = await renderer.renderer.renderAsync(blockTokens, renderer.options, {});
	switch (openToken.tag) {
		case "p": return {
			type: "paragraph",
			text: inlineToken?.content ?? "",
			html
		};
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6": return {
			type: "heading",
			level: Number(openToken.tag.slice(1)),
			text: inlineToken?.content ?? "",
			id: openToken.attrGet("id") ?? void 0,
			html
		};
		case "ul":
		case "ol": return {
			type: "list",
			html
		};
		case "blockquote": return {
			type: "blockquote",
			html
		};
		default: return {
			type: "html",
			html
		};
	}
}
async function createCodeBlock(token, renderer) {
	const [rawLanguage = "", ...metaParts] = token.info.trim().split(/\s+/).filter(Boolean);
	return {
		type: "codeblock",
		code: token.content,
		language: normalizeShikiLanguage(rawLanguage) ?? (rawLanguage || void 0),
		meta: metaParts.length > 0 ? metaParts.join(" ") : void 0,
		html: await renderer.renderer.renderAsync([token], renderer.options, {})
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
//#endregion
export { vitePluginMarkdown };
