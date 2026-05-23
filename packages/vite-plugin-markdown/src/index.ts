import { createMdxShikiCodeBlocks, type ShikiRendererOptions } from '@app-game/vite-plugin-shiki';
import { compile, type CompileOptions } from '@mdx-js/mdx';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

const DEFAULT_QUERY = 'markdown';
const DEFAULT_PREFIX = '\0markdown:';
const DEFAULT_JSX_IMPORT_SOURCE = 'solid-js/h';

type MarkdownCompileOptions = Omit<CompileOptions, 'format' | 'jsxImportSource' | 'remarkPlugins'>;

type MarkdownAstNode = {
  type: string;
  children?: MarkdownAstNode[];
};

export type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  jsxImportSource?: string;
  themes?: ShikiRendererOptions['themes'];
  supportedLanguages?: ShikiRendererOptions['supportedLanguages'];
  defaultLanguage?: ShikiRendererOptions['defaultLanguage'];
  mdxOptions?: MarkdownCompileOptions;
  remarkPlugins?: NonNullable<CompileOptions['remarkPlugins']>;
  unwrapParagraphsInComponentChildren?: boolean;
};

export function vitePluginMarkdown(options: MarkdownRenderPluginOptions = {}): Plugin {
  const queryKey = options.query ?? DEFAULT_QUERY;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const pluginName = options.pluginName ?? 'vite-plugin-markdown';
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

      if (!resolved || !resolved.id.split('?', 2)[0]?.endsWith('.md')) {
        return null;
      }

      return `${prefix}${withQuery(resolved.id, new URLSearchParams(rawQuery))}`;
    },

    async load(id) {
      if (!id.startsWith(prefix)) {
        return null;
      }

      const resolvedId = id.slice(prefix.length);
      const [filePath] = resolvedId.split('?', 2);

      if (!filePath.endsWith('.md')) {
        return null;
      }

      trackVirtualId(virtualIdsByFile, filePath, id);

      this.addWatchFile(filePath);

      const markdownRaw = await readFile(filePath, 'utf8');
      const result = await compile(
        {
          path: filePath,
          value: markdownRaw
        },
        {
          format: 'mdx',
          jsxImportSource: options.jsxImportSource ?? DEFAULT_JSX_IMPORT_SOURCE,
          ...options.mdxOptions,
          remarkPlugins: [
            createMdxShikiCodeBlocks({
              themes: options.themes,
              supportedLanguages: options.supportedLanguages,
              defaultLanguage: options.defaultLanguage
            }),
            ...(options.unwrapParagraphsInComponentChildren === false ? [] : [unwrapParagraphsInComponentChildren]),
            ...(options.remarkPlugins ?? [])
          ]
        }
      );

      return String(result);
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

function trackVirtualId(virtualIdsByFile: Map<string, Set<string>>, filePath: string, virtualId: string): void {
  const knownVirtualIds = virtualIdsByFile.get(filePath);

  if (knownVirtualIds) {
    knownVirtualIds.add(virtualId);
    return;
  }

  virtualIdsByFile.set(filePath, new Set([virtualId]));
}

function unwrapParagraphsInComponentChildren() {
  return (tree: MarkdownAstNode): void => {
    visitMarkdownAst(tree);
  };
}

function visitMarkdownAst(node: MarkdownAstNode): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  const childNodes = Array.isArray(node.children) ? node.children : undefined;

  if (!childNodes) {
    return;
  }

  for (const childNode of childNodes) {
    unwrapSingleParagraphChild(childNode);
    visitMarkdownAst(childNode);
  }
}

function unwrapSingleParagraphChild(node: MarkdownAstNode): void {
  if (!isMdxJsxElement(node) || node.children?.length !== 1) {
    return;
  }

  const [firstChild] = node.children;
  if (!firstChild?.children || firstChild.type !== 'paragraph') {
    return;
  }

  node.children = firstChild.children;
}

function isMdxJsxElement(node: MarkdownAstNode): boolean {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}
