import { createMarkdownExit } from "markdown-exit";
import { readFile } from "node:fs/promises";
import { parseFragment } from "parse5";
import { createShikiRenderer, normalizeShikiLanguage } from "@app-game/vite-plugin-shiki";
//#region src/markdownComponentModulePlugin.ts
const markdownComponentModulePlugin = { renderModule(options) {
	return [
		`import { createComponent } from 'solid-js';`,
		`import { Dynamic, template } from 'solid-js/web';`,
		``,
		`function _DefaultHtmlBlock(props) { return template(props.html)(); }`,
		`function _DefaultShikiCodeBlock(props) { return template(props.html)(); }`,
		`export default function MarkdownContent(props = {}) {`,
		`  const components = props.components ?? {};`,
		`  const content = ${createChildrenExpression(options.nodes)};`,
		`  const Wrapper = components.wrapper;`,
		`  if (!Wrapper) {`,
		`    return content;`,
		`  }`,
		`  return createComponent(Dynamic, {`,
		`    component: Wrapper,`,
		`    get children() {`,
		`      return content;`,
		`    }`,
		`  });`,
		`}`
	].join("\n");
} };
function createChildrenExpression(nodes) {
	if (nodes.length === 0) return "undefined";
	if (nodes.length === 1) return createNodeExpression(nodes[0]);
	return `[${nodes.map((node) => createNodeExpression(node)).join(", ")}]`;
}
function createNodeExpression(node) {
	switch (node.type) {
		case "text": return JSON.stringify(node.value);
		case "html": return `createComponent(Dynamic, { component: components.HtmlBlock ?? _DefaultHtmlBlock, html: ${JSON.stringify(node.html)} })`;
		case "codeblock": return [
			`createComponent(Dynamic, {`,
			`component: components.ShikiCodeBlock ?? components.CodeBlock ?? _DefaultShikiCodeBlock,`,
			`code: ${JSON.stringify(node.code)},`,
			`language: ${serializeOptionalValue(node.language)},`,
			`html: ${JSON.stringify(node.html)},`,
			`meta: ${serializeOptionalValue(node.meta)},`,
			`title: ${serializeOptionalValue(node.title)}`,
			`})`
		].join(" ");
		case "element": {
			const properties = [`component: components[${JSON.stringify(node.tag)}] ?? ${JSON.stringify(node.tag)}`];
			for (const [key, value] of Object.entries(node.attrs ?? {})) properties.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
			if (node.children.length > 0) properties.push(`get children() { return ${createChildrenExpression(node.children)}; }`);
			return `createComponent(Dynamic, { ${properties.join(", ")} })`;
		}
	}
}
function serializeOptionalValue(value) {
	return value == null ? "undefined" : JSON.stringify(value);
}
//#endregion
//#region src/markdownComponentPlugin.ts
function markdownComponentPlugin(markdown) {
	markdown.core.ruler.push("markdown_component_nodes", (state) => {
		for (const token of state.tokens) annotateMarkdownComponentToken(token);
	});
}
function getMarkdownComponentNodes(token) {
	return token.meta?.markdownComponentNodes;
}
function annotateMarkdownComponentToken(token) {
	if (token.hidden) return;
	if (token.type === "inline") {
		const nodes = createInlineComponentNodes(token.children ?? [], token.content);
		if (nodes) setMarkdownComponentNodes(token, nodes);
		return;
	}
	if (token.type === "html_block") {
		const nodes = parseComponentHtml(token.content);
		if (nodes) setMarkdownComponentNodes(token, nodes);
	}
}
function setMarkdownComponentNodes(token, nodes) {
	token.meta = {
		...token.meta ?? {},
		markdownComponentNodes: nodes
	};
}
function createInlineComponentNodes(tokens, content) {
	const promotedNodes = tryCreateInlineComponentNodes(tokens, content);
	if (promotedNodes) return promotedNodes;
	const root = { children: [] };
	const stack = [root];
	for (const token of tokens) {
		const current = stack[stack.length - 1];
		if (token.hidden) continue;
		if (token.type === "text") {
			current?.children.push(...createTextLikeNodes(token.content));
			continue;
		}
		if (token.type === "code_inline") {
			current?.children.push({
				type: "element",
				tag: "code",
				children: [{
					type: "text",
					value: token.content
				}]
			});
			continue;
		}
		if (token.type === "softbreak") {
			current?.children.push({
				type: "text",
				value: "\n"
			});
			continue;
		}
		if (token.type === "hardbreak") {
			current?.children.push({
				type: "element",
				tag: "br",
				children: []
			});
			continue;
		}
		if (token.type === "html_inline") {
			current?.children.push(...createHtmlInlineNodes(token.content));
			continue;
		}
		if (token.nesting === 1) {
			const node = {
				type: "element",
				tag: token.tag,
				attrs: createAttributesObject$1(token),
				children: []
			};
			current?.children.push(node);
			stack.push(node);
			continue;
		}
		if (token.nesting === -1) {
			stack.pop();
			continue;
		}
		if (token.nesting === 0) current?.children.push(createSelfClosingElementNode$1(token));
	}
	return root.children.some(containsComponentNode) ? root.children : void 0;
}
function tryCreateInlineComponentNodes(tokens, content) {
	if (!content || !content.includes("<") || !canPromoteInlineToken(tokens)) return;
	return parseComponentHtml(content);
}
function canPromoteInlineToken(tokens) {
	return tokens.every((token) => token.hidden || token.type === "text" || token.type === "softbreak" || token.type === "hardbreak" || token.type === "html_inline");
}
function createTextLikeNodes(value) {
	if (!value.includes("<")) return [{
		type: "text",
		value
	}];
	return parseComponentHtml(value) ?? [{
		type: "text",
		value
	}];
}
function createHtmlInlineNodes(html) {
	return parseComponentHtml(html) ?? [{
		type: "html",
		html
	}];
}
function createSelfClosingElementNode$1(token) {
	if (token.content) return {
		type: "element",
		tag: token.tag,
		attrs: createAttributesObject$1(token),
		children: [{
			type: "text",
			value: token.content
		}]
	};
	return {
		type: "element",
		tag: token.tag,
		attrs: createAttributesObject$1(token),
		children: []
	};
}
function parseComponentHtml(source) {
	const nodes = createHtmlNodes(parseFragment(source, { sourceCodeLocationInfo: true }).childNodes, source);
	if (!nodes || !nodes.some(containsComponentNode)) return;
	return normalizeHtmlLikeNodes(nodes);
}
function normalizeHtmlLikeNodes(nodes) {
	const normalizedNodes = [];
	for (const node of nodes) {
		if (node.type === "text") {
			if (node.value.trim().length === 0) continue;
			normalizedNodes.push(node);
			continue;
		}
		if (node.type === "element") {
			normalizedNodes.push({
				...node,
				children: normalizeHtmlLikeNodes(node.children)
			});
			continue;
		}
		normalizedNodes.push(node);
	}
	return normalizedNodes;
}
function isComponentTag$1(tag) {
	return /^[A-Z]/.test(tag) || tag.includes(".");
}
function containsComponentNode(node) {
	if (node.type !== "element") return false;
	return isComponentTag$1(node.tag) || node.children.some(containsComponentNode);
}
function createHtmlNodes(childNodes, source) {
	const nodes = [];
	for (const childNode of childNodes) {
		const node = createHtmlNode(childNode, source);
		if (node == null) return;
		if (Array.isArray(node)) {
			nodes.push(...node);
			continue;
		}
		nodes.push(node);
	}
	return nodes;
}
function createHtmlNode(childNode, source) {
	switch (childNode.nodeName) {
		case "#text": return {
			type: "text",
			value: childNode.value
		};
		case "#comment": return {
			type: "html",
			html: `<!--${childNode.data}-->`
		};
		case "#documentType": return {
			type: "html",
			html: `<!DOCTYPE ${childNode.name}>`
		};
		default: return createHtmlElementNode(childNode, source);
	}
}
function createHtmlElementNode(element, source) {
	const tag = getOriginalTagName(element, source);
	const attrs = createHtmlAttributesObject(element, source);
	if (!tag || attrs === null) return;
	const children = createHtmlNodes("content" in element ? element.content.childNodes : element.childNodes, source);
	if (!children) return;
	return {
		type: "element",
		tag,
		attrs,
		children
	};
}
function getOriginalTagName(element, source) {
	const startTag = element.sourceCodeLocation?.startTag;
	if (!startTag) return element.tagName;
	const rawStartTag = source.slice(startTag.startOffset, startTag.endOffset);
	return /^<\s*([^\s/>]+)/.exec(rawStartTag)?.[1] ?? element.tagName;
}
function createHtmlAttributesObject(element, source) {
	if (element.attrs.length === 0) return;
	const locationAttrs = element.sourceCodeLocation?.attrs;
	const attrs = {};
	for (const attr of element.attrs) {
		const location = locationAttrs?.[attr.name];
		const name = location ? source.slice(location.startOffset, location.endOffset).split("=")[0]?.trim() : attr.name;
		if (!name) return null;
		attrs[name] = attr.value;
	}
	return attrs;
}
function createAttributesObject$1(token) {
	if (!token.attrs?.length) return;
	return Object.fromEntries(token.attrs);
}
//#endregion
//#region src/markdownShikiPlugin.ts
function createMarkdownShikiPlugin(options = {}) {
	const shikiRenderer = createShikiRenderer({
		themes: options.themes,
		supportedLanguages: options.supportedLanguages,
		defaultLanguage: options.defaultLanguage
	});
	return { async resolveNodes(token) {
		if (token.type !== "fence" && token.type !== "code_block") return;
		return [await createCodeBlockNode$1(token, shikiRenderer, options.theme)];
	} };
}
async function createCodeBlockNode$1(token, shikiRenderer, theme) {
	const [rawLanguage = "", ...metaParts] = token.info.trim().split(/\s+/).filter(Boolean);
	const language = normalizeShikiLanguage(rawLanguage) ?? (rawLanguage || void 0);
	const meta = metaParts.length > 0 ? metaParts.join(" ") : void 0;
	const result = await shikiRenderer.highlight(token.content, {
		language,
		theme
	});
	return {
		type: "codeblock",
		code: token.content,
		language: result.language,
		meta,
		html: result.html,
		title: extractTitleFromMeta(meta)
	};
}
function extractTitleFromMeta(meta) {
	if (!meta) return;
	const quotedTitle = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)')/.exec(meta);
	if (quotedTitle) return quotedTitle[1] ?? quotedTitle[2];
	return /(?:^|\s)title=([^\s]+)/.exec(meta)?.[1];
}
//#endregion
//#region src/index.ts
const DEFAULT_QUERY = "markdown";
const DEFAULT_PREFIX = "\0markdown:";
function vitePluginMarkdown(options = {}) {
	const queryKey = options.query ?? DEFAULT_QUERY;
	const prefix = options.prefix ?? DEFAULT_PREFIX;
	const pluginName = options.pluginName ?? "vite-plugin-markdown";
	const nodePlugins = createMarkdownNodePlugins(options);
	const modulePlugin = markdownComponentModulePlugin;
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
			const [filePath] = id.slice(prefix.length).split("?", 2);
			trackVirtualId(virtualIdsByFile, filePath, id);
			this.addWatchFile(filePath);
			return renderMarkdownComponentModule(modulePlugin, { nodes: await createMarkdownComponentNodes(await readFile(filePath, "utf8"), await (markdownRendererPromise ??= createRenderer(options)), nodePlugins) });
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
	const renderer = createMarkdownExit({
		html: false,
		...options.markdownOptions
	});
	renderer.use(markdownComponentPlugin);
	await options.configureMarkdown?.(renderer);
	return renderer;
}
async function createMarkdownComponentNodes(markdown, renderer, nodePlugins) {
	const tokens = renderer.parse(markdown, {});
	const root = { children: [] };
	const stack = [root];
	for (const token of tokens) {
		const current = stack[stack.length - 1];
		if (token.hidden) continue;
		const pluginNodes = await resolveTokenNodes(nodePlugins, token, { renderer });
		if (pluginNodes) {
			current?.children.push(...pluginNodes);
			continue;
		}
		if (token.type === "inline") {
			current?.children.push(...getMarkdownComponentNodes(token) ?? createInlineNodes(token.children ?? []));
			continue;
		}
		if (token.type === "fence" || token.type === "code_block") {
			current?.children.push(await createCodeBlockNode(token, renderer));
			continue;
		}
		if (token.type === "html_block") {
			current?.children.push(...getMarkdownComponentNodes(token) ?? [{
				type: "html",
				html: token.content
			}]);
			continue;
		}
		if (token.nesting === 1) {
			const node = {
				type: "element",
				tag: token.tag,
				attrs: createAttributesObject(token),
				children: []
			};
			current?.children.push(node);
			stack.push(node);
			continue;
		}
		if (token.nesting === -1) {
			stack.pop();
			continue;
		}
		if (token.nesting === 0 && token.tag) current?.children.push(createSelfClosingElementNode(token));
	}
	return normalizeMarkdownComponentNodes(root.children);
}
function createMarkdownNodePlugins(options) {
	return [createMarkdownShikiPlugin({
		theme: options.theme,
		themes: options.themes,
		supportedLanguages: options.supportedLanguages,
		defaultLanguage: options.defaultLanguage
	})];
}
function renderMarkdownComponentModule(modulePlugin, options) {
	return modulePlugin.renderModule(options);
}
async function resolveTokenNodes(nodePlugins, token, context) {
	for (const plugin of nodePlugins) {
		const nodes = await plugin.resolveNodes(token, context);
		if (nodes) return nodes;
	}
}
function createInlineNodes(tokens) {
	const root = { children: [] };
	const stack = [root];
	for (const token of tokens) {
		const current = stack[stack.length - 1];
		if (token.hidden) continue;
		if (token.type === "text") {
			current?.children.push({
				type: "text",
				value: token.content
			});
			continue;
		}
		if (token.type === "code_inline") {
			current?.children.push({
				type: "element",
				tag: "code",
				children: [{
					type: "text",
					value: token.content
				}]
			});
			continue;
		}
		if (token.type === "softbreak") {
			current?.children.push({
				type: "text",
				value: "\n"
			});
			continue;
		}
		if (token.type === "hardbreak") {
			current?.children.push({
				type: "element",
				tag: "br",
				children: []
			});
			continue;
		}
		if (token.type === "html_inline") {
			current?.children.push({
				type: "html",
				html: token.content
			});
			continue;
		}
		if (token.nesting === 1) {
			const node = {
				type: "element",
				tag: token.tag,
				attrs: createAttributesObject(token),
				children: []
			};
			current?.children.push(node);
			stack.push(node);
			continue;
		}
		if (token.nesting === -1) {
			stack.pop();
			continue;
		}
		if (token.nesting === 0) current?.children.push(createSelfClosingElementNode(token));
	}
	return root.children;
}
function createSelfClosingElementNode(token) {
	if (token.content) return {
		type: "element",
		tag: token.tag,
		attrs: createAttributesObject(token),
		children: [{
			type: "text",
			value: token.content
		}]
	};
	return {
		type: "element",
		tag: token.tag,
		attrs: createAttributesObject(token),
		children: []
	};
}
function normalizeMarkdownComponentNodes(nodes) {
	const normalizedNodes = [];
	for (const node of nodes) {
		if (node.type !== "element") {
			normalizedNodes.push(node);
			continue;
		}
		const children = normalizeMarkdownComponentNodes(node.children);
		if (node.tag === "p" && shouldUnwrapComponentParagraph(children)) {
			normalizedNodes.push(...children);
			continue;
		}
		normalizedNodes.push({
			...node,
			children
		});
	}
	return normalizedNodes;
}
function shouldUnwrapComponentParagraph(children) {
	return children.length > 0 && children.every((child) => child.type === "element" && isComponentTag(child.tag));
}
function isComponentTag(tag) {
	return /^[A-Z]/.test(tag) || tag.includes(".");
}
function createAttributesObject(token) {
	if (!token.attrs?.length) return;
	return Object.fromEntries(token.attrs);
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
export { createMarkdownShikiPlugin, markdownComponentModulePlugin, markdownComponentPlugin, vitePluginMarkdown };
