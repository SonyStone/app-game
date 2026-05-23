import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { getSingletonHighlighter } from 'shiki';
import type { Plugin } from 'vite';
import { createVsCodeCssVariablesTheme } from './css-variable-theme';

const DEFAULT_QUERY = 'shiki';
const DEFAULT_PREFIX = '\0shiki:';
const DEFAULT_DEFAULT_LANGUAGE = 'plaintext';
const CSS_VARIABLES_THEME = createVsCodeCssVariablesTheme();

export const DEFAULT_SUPPORTED_LANGUAGES = [
  'tsx',
  'typescript',
  'jsx',
  'javascript',
  'json',
  'bash',
  'html',
  'css',
  'scss',
  'markdown',
  'glsl',
  'yaml',
  'toml',
  'plaintext'
] as const;

type DefaultLanguage = (typeof DEFAULT_SUPPORTED_LANGUAGES)[number];

export type CodeBlockHighlightPluginOptions = {
  themes?: readonly string[];
  query?: string;
  prefix?: string;
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
  pluginName?: string;
};

export type ShikiRendererOptions = {
  themes?: readonly string[];
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
};

export type ShikiHighlightOptions = {
  language?: string | null;
  theme?: string;
};

export type MdxShikiCodeBlocksOptions = ShikiRendererOptions & {
  componentName?: string;
};

export function createShikiRenderer(options: ShikiRendererOptions = {}) {
  const themes = options.themes ?? [];
  const supportedLanguages = options.supportedLanguages ?? DEFAULT_SUPPORTED_LANGUAGES;
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_DEFAULT_LANGUAGE;

  let highlighterPromise: ReturnType<typeof getSingletonHighlighter> | undefined;

  return {
    async highlight(
      code: string,
      highlightOptions: ShikiHighlightOptions = {}
    ): Promise<{
      html: string;
      language: string;
      theme: string;
    }> {
      const language = normalizeShikiLanguage(highlightOptions.language) ?? defaultLanguage;
      const theme = highlightOptions.theme ?? themes[0] ?? CSS_VARIABLES_THEME.name;
      const highlighter = await (highlighterPromise ??= getSingletonHighlighter({
        themes: [CSS_VARIABLES_THEME, ...themes.filter((themeName) => themeName !== CSS_VARIABLES_THEME.name)],
        langs: [...supportedLanguages]
      }));

      if (!highlighter.getLoadedThemes().includes(theme)) {
        await highlighter.loadTheme(
          theme as Parameters<Awaited<ReturnType<typeof getSingletonHighlighter>>['loadTheme']>[0]
        );
      }

      return {
        html: highlighter.codeToHtml(code, {
          lang: language,
          theme
        }),
        language,
        theme
      };
    }
  };
}

// TODO: Unneeded?
export function vitePluginShiki(options: CodeBlockHighlightPluginOptions = {}): Plugin {
  const themes = options.themes ?? [];
  const queryKey = options.query ?? DEFAULT_QUERY;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_DEFAULT_LANGUAGE;
  const pluginName = options.pluginName ?? 'vite-plugin-markdown-shiki';
  const shikiRenderer = createShikiRenderer({
    themes,
    supportedLanguages: options.supportedLanguages,
    defaultLanguage
  });
  const virtualIdsByFile = new Map<string, Set<string>>();

  return {
    name: pluginName,
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!hasQuery(source, queryKey)) {
        return null;
      }

      const [requestPath, rawQuery = ''] = source.split('?', 2);
      const query = new URLSearchParams(rawQuery);

      query.delete(queryKey);

      const resolved = await this.resolve(withQuery(requestPath, query), importer, {
        skipSelf: true
      });

      if (!resolved) {
        return null;
      }

      return `${prefix}${withQuery(resolved.id, new URLSearchParams(rawQuery))}`;
    },

    async load(id) {
      if (!id.startsWith(prefix)) {
        return null;
      }

      const resolvedId = id.slice(prefix.length);
      const [filePath, rawQuery = ''] = resolvedId.split('?', 2);

      trackVirtualId(virtualIdsByFile, filePath, id);

      this.addWatchFile(filePath);

      const code = await readFile(filePath, 'utf8');
      const params = new URLSearchParams(rawQuery);
      const language = resolveLanguage(filePath, params, defaultLanguage);
      const { html: highlightedHtml } = await shikiRenderer.highlight(code, {
        language,
        theme: params.get('theme') ?? undefined
      });

      return [
        `export const code = ${JSON.stringify(code)};`,
        `export const language = ${JSON.stringify(language)};`,
        `export const html = ${JSON.stringify(highlightedHtml)};`,
        `export default ${JSON.stringify(highlightedHtml)};`
      ].join('\n');
    },

    handleHotUpdate(ctx) {
      const virtualIds = virtualIdsByFile.get(ctx.file);

      if (!virtualIds?.size) {
        return;
      }

      const modules = [...virtualIds]
        .map((virtualId) => ctx.server.moduleGraph.getModuleById(virtualId))
        .filter((module) => module != null);

      for (const module of modules) {
        ctx.server.moduleGraph.invalidateModule(module);
      }

      return modules;
    }
  };
}

export function createMdxShikiCodeBlocks(options: MdxShikiCodeBlocksOptions = {}) {
  const componentName = options.componentName ?? 'Shiki';
  const shikiRenderer = createShikiRenderer(options);

  return function remarkMdxShikiCodeBlocks() {
    return async function transform(tree: MdxParentNode): Promise<void> {
      await visitCodeBlocks(tree, async (node, parent, index) => {
        const { html, language } = await shikiRenderer.highlight(node.value, {
          language: node.lang ?? undefined
        });
        const title = extractCodeBlockTitle(node.meta);
        const attributes: MdxJsxAttributeNode[] = [
          { type: 'mdxJsxAttribute', name: 'code', value: node.value },
          { type: 'mdxJsxAttribute', name: 'language', value: language },
          { type: 'mdxJsxAttribute', name: 'html', value: html }
        ];

        if (title) {
          attributes.push({ type: 'mdxJsxAttribute', name: 'title', value: title });
        }

        parent.children[index] = {
          type: 'mdxJsxFlowElement',
          name: componentName,
          attributes,
          children: []
        } satisfies MdxJsxFlowElementNode;
      });
    };
  };
}

function hasQuery(id: string, queryKey: string): boolean {
  const [, rawQuery = ''] = id.split('?', 2);

  if (!rawQuery) {
    return false;
  }

  return new URLSearchParams(rawQuery).has(queryKey);
}

function withQuery(path: string, query: URLSearchParams): string {
  const queryString = query.toString();

  if (!queryString) {
    return path;
  }

  return `${path}?${queryString}`;
}

function resolveLanguage(filePath: string, query: URLSearchParams, defaultLanguage: string): string {
  const explicitLanguage = normalizeShikiLanguage(query.get('lang'));

  if (explicitLanguage) {
    return explicitLanguage;
  }

  return normalizeShikiLanguage(extname(filePath).slice(1)) ?? defaultLanguage;
}

export function normalizeShikiLanguage(language?: string | null): string | undefined {
  switch (language?.toLowerCase()) {
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'json':
      return 'json';
    case 'sh':
    case 'shell':
    case 'bash':
      return 'bash';
    case 'htm':
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'scss':
    case 'sass':
    case 'less':
      return 'scss';
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'markdown';
    case 'frag':
    case 'vert':
    case 'glsl':
    case 'wgsl':
      return 'glsl';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'txt':
    case 'text':
    case 'plaintext':
      return 'plaintext';
    default:
      return undefined;
  }
}

export type ShikiQueryLanguage = DefaultLanguage;

type MdxJsxAttributeNode = {
  type: 'mdxJsxAttribute';
  name: string;
  value: string;
};

type MdxNode =
  | {
      type: string;
      children?: MdxNode[];
      value?: string;
      lang?: string | null;
      meta?: string | null;
    }
  | MdxJsxFlowElementNode;

type MdxParentNode = {
  children: MdxNode[];
};

type MdxCodeNode = MdxNode & {
  type: 'code';
  value: string;
};

type MdxJsxFlowElementNode = {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: MdxJsxAttributeNode[];
  children: [];
};

function trackVirtualId(virtualIdsByFile: Map<string, Set<string>>, filePath: string, virtualId: string): void {
  const knownVirtualIds = virtualIdsByFile.get(filePath);

  if (knownVirtualIds) {
    knownVirtualIds.add(virtualId);
    return;
  }

  virtualIdsByFile.set(filePath, new Set([virtualId]));
}

async function visitCodeBlocks(
  parent: MdxParentNode,
  visitor: (node: MdxCodeNode, parent: MdxParentNode, index: number) => Promise<void>
): Promise<void> {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];

    if (isCodeNode(child)) {
      await visitor(child, parent, index);
      continue;
    }

    if (Array.isArray(child.children)) {
      await visitCodeBlocks(child as MdxParentNode, visitor);
    }
  }
}

function isCodeNode(node: MdxNode): node is MdxCodeNode {
  return node.type === 'code' && typeof node.value === 'string';
}

function extractCodeBlockTitle(meta?: string | null): string | undefined {
  if (!meta) {
    return undefined;
  }

  const quotedTitle = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)')/.exec(meta);

  if (quotedTitle) {
    return quotedTitle[1] ?? quotedTitle[2];
  }

  const bareTitle = /(?:^|\s)title=([^\s]+)/.exec(meta);

  return bareTitle?.[1];
}
