import { createShikiRenderer, normalizeShikiLanguage, type ShikiRendererOptions } from '@app-game/vite-plugin-shiki';
import type { MarkdownExit, MarkdownExitOptions } from 'markdown-exit';
import { createMarkdownExit } from 'markdown-exit';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

const DEFAULT_QUERY = 'markdown';
const DEFAULT_PREFIX = '\0markdown:';

type MarkdownExitOptionsArgument = MarkdownExitOptions;

export type MarkdownBlock =
  | {
      type: 'paragraph';
      tag: 'p';
      html: string;
      text: string;
    }
  | {
      type: 'heading';
      tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      html: string;
      text: string;
      level: 1 | 2 | 3 | 4 | 5 | 6;
      id?: string;
    }
  | {
      type: 'codeblock';
      tag: 'pre';
      html: string;
      code: string;
      language?: string;
      meta?: string;
    }
  | {
      type: 'list' | 'blockquote' | 'html';
      tag: 'ul' | 'ol' | 'blockquote' | null;
      html: string;
    };

export type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  theme?: string;
  themes?: ShikiRendererOptions['themes'];
  supportedLanguages?: ShikiRendererOptions['supportedLanguages'];
  defaultLanguage?: ShikiRendererOptions['defaultLanguage'];
  markdownOptions?: MarkdownExitOptionsArgument;
  configureMarkdown?: (markdown: MarkdownExit) => void | Promise<void>;
};

export function vitePluginMarkdown(options: MarkdownRenderPluginOptions = {}): Plugin {
  const queryKey = options.query ?? DEFAULT_QUERY;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const pluginName = options.pluginName ?? 'vite-plugin-markdown';

  let markdownRendererPromise: Promise<MarkdownExit> | undefined;
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
      const query = new URLSearchParams(rawQuery);

      trackVirtualId(virtualIdsByFile, filePath, id);

      this.addWatchFile(filePath);

      const markdown = await readFile(filePath, 'utf8');
      const renderer = await (markdownRendererPromise ??= createRenderer(options));
      const html = await renderer.renderAsync(markdown);

      const exports = [
        `export const markdown = ${JSON.stringify(markdown)};`,
        `export const html = ${JSON.stringify(html)};`
      ];

      if (query.has('blocks')) {
        const blocks = await createMarkdownBlocks(markdown, renderer);
        exports.push(`export const blocks = ${JSON.stringify(blocks)};`);
      }

      exports.push(`export default ${JSON.stringify(html)};`);

      return exports.join('\n');
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

async function createRenderer(options: MarkdownRenderPluginOptions): Promise<MarkdownExit> {
  const shikiRenderer = createShikiRenderer({
    themes: options.themes,
    supportedLanguages: options.supportedLanguages,
    defaultLanguage: options.defaultLanguage
  });
  const markdownOptions: MarkdownExitOptionsArgument = {
    html: true,
    ...options.markdownOptions,
    highlight:
      options.markdownOptions?.highlight ??
      (async (code: string, language?: string) => {
        const result = await shikiRenderer.highlight(code, {
          language: normalizeShikiLanguage(language),
          theme: options.theme
        });

        return result.html;
      })
  };
  const renderer = createMarkdownExit(markdownOptions);

  await options.configureMarkdown?.(renderer);

  return renderer;
}

async function createMarkdownBlocks(markdown: string, renderer: MarkdownExit): Promise<MarkdownBlock[]> {
  const tokens = renderer.parse(markdown, {});
  const blocks: MarkdownBlock[] = [];

  console.log('tokens', tokens);

  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];

    if (token.level !== 0) {
      index += 1;
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
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

    if (token.type === 'html_block') {
      blocks.push({
        type: 'html',
        tag: token.tag || null,
        html: await renderer.renderer.renderAsync([token], renderer.options, {})
      });
      index += 1;
      continue;
    }

    index += 1;
  }

  return blocks;
}

function findBlockEnd(tokens: ReturnType<MarkdownExit['parse']>, startIndex: number): number {
  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.level !== 0 && index !== startIndex) {
      continue;
    }

    if (token.nesting === 1) {
      depth += 1;
    } else if (token.nesting === -1) {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    } else if (index !== startIndex && depth === 0) {
      return index;
    }
  }

  return tokens.length;
}

async function createContainerBlock(
  blockTokens: ReturnType<MarkdownExit['parse']>,
  renderer: MarkdownExit
): Promise<MarkdownBlock> {
  const [openToken, inlineToken] = blockTokens;
  const html = await renderer.renderer.renderAsync([inlineToken], renderer.options, {});

  switch (openToken.tag) {
    case 'p':
      return {
        type: 'paragraph',
        tag: openToken.tag,
        text: inlineToken?.content ?? '',
        html
      };
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return {
        type: 'heading',
        tag: openToken.tag,
        level: Number(openToken.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
        text: inlineToken?.content ?? '',
        id: openToken.attrGet('id') ?? undefined,
        html
      };
    case 'ul':
    case 'ol':
      return {
        type: 'list',
        tag: openToken.tag,
        html
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        tag: openToken.tag,
        html
      };
    default: {
      return {
        type: 'html',
        tag: openToken.tag || null,
        html
      };
    }
  }
}

async function createCodeBlock(
  token: ReturnType<MarkdownExit['parse']>[number],
  renderer: MarkdownExit
): Promise<MarkdownBlock> {
  const [rawLanguage = '', ...metaParts] = token.info.trim().split(/\s+/).filter(Boolean);

  return {
    type: 'codeblock',
    code: token.content,
    language: normalizeShikiLanguage(rawLanguage) ?? (rawLanguage || undefined),
    meta: metaParts.length > 0 ? metaParts.join(' ') : undefined,
    html: await renderer.renderer.renderAsync([token], renderer.options, {})
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
