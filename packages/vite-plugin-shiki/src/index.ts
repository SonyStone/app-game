import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { getSingletonHighlighter } from 'shiki';
import type { Plugin } from 'vite';

const DEFAULT_THEME = 'nord';
const DEFAULT_QUERY = 'shiki';
const DEFAULT_PREFIX = '\0shiki:';
const DEFAULT_SUPPORTED_LANGUAGES = [
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
  theme?: string;
  query?: string;
  prefix?: string;
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
  pluginName?: string;
};

export function codeBlockHighlightPlugin(options: CodeBlockHighlightPluginOptions = {}): Plugin {
  const theme = options.theme ?? DEFAULT_THEME;
  const queryKey = options.query ?? DEFAULT_QUERY;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const supportedLanguages = options.supportedLanguages ?? DEFAULT_SUPPORTED_LANGUAGES;
  const defaultLanguage = options.defaultLanguage ?? 'plaintext';
  const pluginName = options.pluginName ?? 'vite-plugin-shiki';

  let highlighterPromise: ReturnType<typeof createCodeHighlighter> | undefined;
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
      const language = resolveLanguage(filePath, new URLSearchParams(rawQuery), defaultLanguage);
      const highlighter = await (highlighterPromise ??= createCodeHighlighter(theme, supportedLanguages));
      const highlightedHtml = await highlighter.codeToHtml(code, {
        lang: language,
        theme
      });

      return [
        `export const code = ${JSON.stringify(code)};`,
        `export const language = ${JSON.stringify(language)};`,
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

export function vitePluginShiki(options?: CodeBlockHighlightPluginOptions): Plugin {
  return codeBlockHighlightPlugin(options);
}

async function createCodeHighlighter(theme: string, supportedLanguages: readonly string[]) {
  return getSingletonHighlighter({
    themes: [theme],
    langs: [...supportedLanguages]
  });
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
  const explicitLanguage = normalizeLanguage(query.get('lang'));

  if (explicitLanguage) {
    return explicitLanguage;
  }

  return normalizeLanguage(extname(filePath).slice(1)) ?? defaultLanguage;
}

function normalizeLanguage(language?: string | null): string | undefined {
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

function trackVirtualId(virtualIdsByFile: Map<string, Set<string>>, filePath: string, virtualId: string): void {
  const knownVirtualIds = virtualIdsByFile.get(filePath);

  if (knownVirtualIds) {
    knownVirtualIds.add(virtualId);
    return;
  }

  virtualIdsByFile.set(filePath, new Set([virtualId]));
}
