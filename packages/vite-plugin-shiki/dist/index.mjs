import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { getSingletonHighlighter } from "shiki";
//#region src/css-variable-theme.ts
function createVsCodeCssVariablesTheme(options = {
	name: "css-variables",
	variablePrefix: `--shiki-`
}) {
	const variable = (name) => `var(${options.variablePrefix}${name})`;
	return {
		name: options.name,
		type: "dark",
		colors: {
			"editor.foreground": variable("foreground"),
			"editor.background": variable("background")
		},
		fg: variable("foreground"),
		bg: variable("background"),
		semanticHighlighting: true,
		semanticTokenColors: {
			customLiteral: variable("semantic-custom-literal"),
			newOperator: variable("semantic-new-operator"),
			numberLiteral: variable("semantic-number-literal"),
			stringLiteral: variable("semantic-string-literal")
		},
		tokenColors: [
			{
				scope: ["comment"],
				settings: { foreground: variable("token-comment") }
			},
			{
				scope: ["constant.character", "constant.other.option"],
				settings: { foreground: variable("token-character") }
			},
			{
				scope: [
					"constant.character.character-class.regexp",
					"constant.other.character-class.set.regexp",
					"constant.other.character-class.regexp",
					"constant.character.set.regexp"
				],
				settings: { foreground: variable("token-regexp-character") }
			},
			{
				scope: ["constant.character.escape"],
				settings: { foreground: variable("token-escape") }
			},
			{
				scope: ["constant.language"],
				settings: { foreground: variable("token-constant-language") }
			},
			{
				scope: [
					"constant.numeric",
					"variable.other.enummember",
					"keyword.operator.plus.exponent",
					"keyword.operator.minus.exponent"
				],
				settings: { foreground: variable("token-number") }
			},
			{
				scope: ["constant.regexp"],
				settings: { foreground: variable("token-regexp") }
			},
			{
				scope: ["constant.sha.git-rebase"],
				settings: { foreground: variable("token-git-sha") }
			},
			{
				scope: ["emphasis"],
				settings: { fontStyle: "italic" }
			},
			{
				scope: [
					"entity.name.function",
					"support.function",
					"support.constant.handlebars",
					"source.powershell variable.other.member",
					"entity.name.operator.custom-literal"
				],
				settings: { foreground: variable("token-function") }
			},
			{
				scope: ["entity.name.label"],
				settings: { foreground: variable("token-label") }
			},
			{
				scope: ["entity.name.selector"],
				settings: { foreground: variable("token-selector") }
			},
			{
				scope: ["entity.name.tag"],
				settings: { foreground: variable("token-tag") }
			},
			{
				scope: ["entity.name.tag.css", "entity.name.tag.less"],
				settings: { foreground: variable("token-style-tag") }
			},
			{
				scope: ["entity.other.attribute-name"],
				settings: { foreground: variable("token-attribute") }
			},
			{
				scope: [
					"entity.other.attribute-name.class.css",
					"source.css entity.other.attribute-name.class",
					"entity.other.attribute-name.id.css",
					"entity.other.attribute-name.parent-selector.css",
					"entity.other.attribute-name.parent.less",
					"source.css entity.other.attribute-name.pseudo-class",
					"entity.other.attribute-name.pseudo-element.css",
					"source.css.less entity.other.attribute-name.id",
					"entity.other.attribute-name.scss"
				],
				settings: { foreground: variable("token-style-attribute") }
			},
			{
				scope: ["header"],
				settings: { foreground: variable("token-header") }
			},
			{
				scope: ["invalid"],
				settings: { foreground: variable("token-invalid") }
			},
			{
				scope: ["keyword"],
				settings: { foreground: variable("token-keyword") }
			},
			{
				scope: ["keyword.control"],
				settings: { foreground: variable("token-control") }
			},
			{
				scope: [
					"keyword.control",
					"source.cpp keyword.operator.new",
					"keyword.operator.delete",
					"keyword.other.using",
					"keyword.other.directive.using",
					"keyword.other.operator",
					"entity.name.operator"
				],
				settings: { foreground: variable("token-keyword-special") }
			},
			{
				scope: ["keyword.operator"],
				settings: { foreground: variable("token-operator") }
			},
			{
				scope: [
					"keyword.operator.new",
					"keyword.operator.expression",
					"keyword.operator.cast",
					"keyword.operator.sizeof",
					"keyword.operator.alignof",
					"keyword.operator.typeid",
					"keyword.operator.alignas",
					"keyword.operator.instanceof",
					"keyword.operator.logical.python",
					"keyword.operator.wordlike"
				],
				settings: { foreground: variable("token-word-operator") }
			},
			{
				scope: ["keyword.operator.or.regexp", "keyword.control.anchor.regexp"],
				settings: { foreground: variable("token-regexp-anchor") }
			},
			{
				scope: ["keyword.operator.quantifier.regexp"],
				settings: { foreground: variable("token-regexp-quantifier") }
			},
			{
				scope: ["keyword.other.unit"],
				settings: { foreground: variable("token-unit") }
			},
			{
				scope: ["markup.bold"],
				settings: {
					foreground: variable("token-markdown-bold"),
					fontStyle: "bold"
				}
			},
			{
				scope: ["markup.changed"],
				settings: { foreground: variable("token-markdown-changed") }
			},
			{
				scope: ["markup.deleted"],
				settings: { foreground: variable("token-markdown-deleted") }
			},
			{
				scope: ["markup.heading"],
				settings: {
					foreground: variable("token-markdown-heading"),
					fontStyle: "bold"
				}
			},
			{
				scope: ["markup.inline.raw"],
				settings: { foreground: variable("token-markdown-raw") }
			},
			{
				scope: ["markup.inserted"],
				settings: { foreground: variable("token-markdown-inserted") }
			},
			{
				scope: ["markup.italic"],
				settings: { fontStyle: "italic" }
			},
			{
				scope: ["markup.strikethrough"],
				settings: { fontStyle: "strikethrough" }
			},
			{
				scope: ["markup.underline"],
				settings: { fontStyle: "underline" }
			},
			{
				scope: ["meta.diff.header"],
				settings: { foreground: variable("token-diff-header") }
			},
			{
				scope: [
					"meta.embedded",
					"source.groovy.embedded",
					"string meta.image.inline.markdown",
					"variable.legacy.builtin.python"
				],
				settings: { foreground: variable("token-embedded") }
			},
			{
				scope: ["meta.object-literal.key"],
				settings: { foreground: variable("token-object-key") }
			},
			{
				scope: ["meta.preprocessor", "entity.name.function.preprocessor"],
				settings: { foreground: variable("token-preprocessor") }
			},
			{
				scope: ["meta.preprocessor.numeric"],
				settings: { foreground: variable("token-preprocessor-number") }
			},
			{
				scope: ["meta.preprocessor.string"],
				settings: { foreground: variable("token-preprocessor-string") }
			},
			{
				scope: ["meta.structure.dictionary.key.python"],
				settings: { foreground: variable("token-dictionary-key") }
			},
			{
				scope: ["meta.template.expression"],
				settings: { foreground: variable("token-template") }
			},
			{
				scope: [
					"meta.type.cast.expr",
					"meta.type.new.expr",
					"support.constant.math",
					"support.constant.dom",
					"support.constant.json",
					"entity.other.inherited-class",
					"punctuation.separator.namespace.ruby"
				],
				settings: { foreground: variable("token-type-meta") }
			},
			{
				scope: [
					"punctuation.definition.group.regexp",
					"punctuation.definition.group.assertion.regexp",
					"punctuation.definition.character-class.regexp",
					"punctuation.character.set.begin.regexp",
					"punctuation.character.set.end.regexp",
					"keyword.operator.negation.regexp",
					"support.other.parenthesis.regexp"
				],
				settings: { foreground: variable("token-regexp-delimiter") }
			},
			{
				scope: ["punctuation.definition.list.begin.markdown"],
				settings: { foreground: variable("token-markdown-list") }
			},
			{
				scope: ["punctuation.definition.quote.begin.markdown"],
				settings: { foreground: variable("token-markdown-quote") }
			},
			{
				scope: ["punctuation.definition.quote.begin.markdown", "punctuation.definition.list.begin.markdown"],
				settings: { foreground: variable("token-markdown-block") }
			},
			{
				scope: ["punctuation.definition.tag"],
				settings: { foreground: variable("token-tag-delimiter") }
			},
			{
				scope: [
					"punctuation.definition.template-expression.begin",
					"punctuation.definition.template-expression.end",
					"punctuation.section.embedded"
				],
				settings: { foreground: variable("token-template-delimiter") }
			},
			{
				scope: ["punctuation.section.embedded.begin.php", "punctuation.section.embedded.end.php"],
				settings: { foreground: variable("token-php-delimiter") }
			},
			{
				scope: ["storage"],
				settings: { foreground: variable("token-storage") }
			},
			{
				scope: ["storage.modifier", "keyword.operator.noexcept"],
				settings: { foreground: variable("token-modifier") }
			},
			{
				scope: [
					"storage.modifier.import.java",
					"variable.language.wildcard.java",
					"storage.modifier.package.java"
				],
				settings: { foreground: variable("token-import") }
			},
			{
				scope: ["storage.type"],
				settings: { foreground: variable("token-storage-type") }
			},
			{
				scope: ["string", "meta.embedded.assembly"],
				settings: { foreground: variable("token-string") }
			},
			{
				scope: [
					"string.comment.buffered.block.pug",
					"string.quoted.pug",
					"string.interpolated.pug",
					"string.unquoted.plain.in.yaml",
					"string.unquoted.plain.out.yaml",
					"string.unquoted.block.yaml",
					"string.quoted.single.yaml",
					"string.quoted.double.xml",
					"string.quoted.single.xml",
					"string.unquoted.cdata.xml",
					"string.quoted.double.html",
					"string.quoted.single.html",
					"string.unquoted.html",
					"string.quoted.single.handlebars",
					"string.quoted.double.handlebars"
				],
				settings: { foreground: variable("token-string-text") }
			},
			{
				scope: ["string.regexp"],
				settings: { foreground: variable("token-string-regexp") }
			},
			{
				scope: ["string.tag"],
				settings: { foreground: variable("token-string-tag") }
			},
			{
				scope: ["string.value"],
				settings: { foreground: variable("token-string-value") }
			},
			{
				scope: ["strong"],
				settings: { fontStyle: "bold" }
			},
			{
				scope: [
					"support.class",
					"support.type",
					"entity.name.type",
					"entity.name.namespace",
					"entity.other.attribute",
					"entity.name.scope-resolution",
					"entity.name.class",
					"storage.type.numeric.go",
					"storage.type.byte.go",
					"storage.type.boolean.go",
					"storage.type.string.go",
					"storage.type.uintptr.go",
					"storage.type.error.go",
					"storage.type.rune.go",
					"storage.type.cs",
					"storage.type.generic.cs",
					"storage.type.modifier.cs",
					"storage.type.variable.cs",
					"storage.type.annotation.java",
					"storage.type.generic.java",
					"storage.type.java",
					"storage.type.object.array.java",
					"storage.type.primitive.array.java",
					"storage.type.primitive.java",
					"storage.type.token.java",
					"storage.type.groovy",
					"storage.type.annotation.groovy",
					"storage.type.parameters.groovy",
					"storage.type.generic.groovy",
					"storage.type.object.array.groovy",
					"storage.type.primitive.array.groovy",
					"storage.type.primitive.groovy"
				],
				settings: { foreground: variable("token-type") }
			},
			{
				scope: [
					"support.constant.property-value",
					"support.constant.font-name",
					"support.constant.media-type",
					"support.constant.media",
					"constant.other.color.rgb-value",
					"constant.other.rgb-value",
					"support.constant.color"
				],
				settings: { foreground: variable("token-value") }
			},
			{
				scope: ["support.function.git-rebase"],
				settings: { foreground: variable("token-rebase") }
			},
			{
				scope: ["support.type.property-name.json"],
				settings: { foreground: variable("token-json-key") }
			},
			{
				scope: [
					"support.type.vendored.property-name",
					"support.type.property-name",
					"source.css variable",
					"source.coffee.embedded"
				],
				settings: { foreground: variable("token-property") }
			},
			{
				scope: [
					"variable",
					"meta.definition.variable.name",
					"support.variable",
					"entity.name.variable",
					"constant.other.placeholder"
				],
				settings: { foreground: variable("token-variable") }
			},
			{
				scope: ["variable.language"],
				settings: { foreground: variable("token-variable-language") }
			},
			{
				scope: ["variable.other.constant", "variable.other.enummember"],
				settings: { foreground: variable("token-constant-variable") }
			}
		]
	};
}
//#endregion
//#region src/index.ts
const DEFAULT_QUERY = "shiki";
const DEFAULT_PREFIX = "\0shiki:";
const DEFAULT_SUPPORTED_LANGUAGES = [
	"tsx",
	"typescript",
	"jsx",
	"javascript",
	"json",
	"bash",
	"html",
	"css",
	"scss",
	"markdown",
	"glsl",
	"yaml",
	"toml",
	"plaintext"
];
function vitePluginShiki(options = {}) {
	const cssVariablesTheme = createVsCodeCssVariablesTheme();
	const themes = options.themes ?? [];
	const queryKey = options.query ?? DEFAULT_QUERY;
	const prefix = options.prefix ?? DEFAULT_PREFIX;
	const supportedLanguages = options.supportedLanguages ?? DEFAULT_SUPPORTED_LANGUAGES;
	const defaultLanguage = options.defaultLanguage ?? "plaintext";
	const pluginName = options.pluginName ?? "vite-plugin-shiki";
	let highlighterPromise;
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
			trackVirtualId(virtualIdsByFile, filePath, id);
			this.addWatchFile(filePath);
			const code = await readFile(filePath, "utf8");
			const params = new URLSearchParams(rawQuery);
			const language = resolveLanguage(filePath, params, defaultLanguage);
			const theme = params.get("theme") ?? themes[0] ?? cssVariablesTheme.name;
			const highlighter = await (highlighterPromise ??= getSingletonHighlighter({
				themes: [cssVariablesTheme, ...themes.filter((theme) => theme !== cssVariablesTheme.name)],
				langs: [...supportedLanguages]
			}));
			if (!highlighter.getLoadedThemes().includes(theme)) await highlighter.loadTheme(theme);
			const highlightedHtml = highlighter.codeToHtml(code, {
				lang: language,
				theme
			});
			return [
				`export const code = ${JSON.stringify(code)};`,
				`export const language = ${JSON.stringify(language)};`,
				`export const html = ${JSON.stringify(highlightedHtml)};`,
				`export default ${JSON.stringify(highlightedHtml)};`
			].join("\n");
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
function resolveLanguage(filePath, query, defaultLanguage) {
	const explicitLanguage = normalizeLanguage(query.get("lang"));
	if (explicitLanguage) return explicitLanguage;
	return normalizeLanguage(extname(filePath).slice(1)) ?? defaultLanguage;
}
function normalizeLanguage(language) {
	switch (language?.toLowerCase()) {
		case "ts":
		case "typescript": return "typescript";
		case "tsx": return "tsx";
		case "js":
		case "javascript": return "javascript";
		case "jsx": return "jsx";
		case "json": return "json";
		case "sh":
		case "shell":
		case "bash": return "bash";
		case "htm":
		case "html": return "html";
		case "css": return "css";
		case "scss":
		case "sass":
		case "less": return "scss";
		case "md":
		case "mdx":
		case "markdown": return "markdown";
		case "frag":
		case "vert":
		case "glsl":
		case "wgsl": return "glsl";
		case "yaml":
		case "yml": return "yaml";
		case "toml": return "toml";
		case "txt":
		case "text":
		case "plaintext": return "plaintext";
		default: return;
	}
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
export { vitePluginShiki };
