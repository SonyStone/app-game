import type { MarkdownExit } from 'markdown-exit';
import { createMarkdownExit } from 'markdown-exit';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

const DEFAULT_QUERY = 'markdown';
const DEFAULT_PREFIX = '\0markdown:';

export type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  markdownOptions?: Parameters<typeof createMarkdownExit>[0];
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
      const [filePath] = resolvedId.split('?', 2);

      trackVirtualId(virtualIdsByFile, filePath, id);

      this.addWatchFile(filePath);

      const markdown = await readFile(filePath, 'utf8');
      const renderer = await (markdownRendererPromise ??= createRenderer(options));
      const html = await renderer.renderAsync(markdown);

      return [
        `export const markdown = ${JSON.stringify(markdown)};`,
        `export const html = ${JSON.stringify(html)};`,
        `export default ${JSON.stringify(html)};`
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

async function createRenderer(options: MarkdownRenderPluginOptions): Promise<MarkdownExit> {
  const renderer = createMarkdownExit(options.markdownOptions);

  await options.configureMarkdown?.(renderer);

  return renderer;
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
