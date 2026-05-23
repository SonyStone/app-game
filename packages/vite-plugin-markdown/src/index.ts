import { type ShikiRendererOptions } from '@app-game/vite-plugin-shiki';
import type { MarkdownExit, MarkdownExitOptions } from 'markdown-exit';
import { createMarkdownExit } from 'markdown-exit';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { markdownComponentModulePlugin } from './markdownComponentModulePlugin';
import {
  getMarkdownComponentNodes,
  markdownComponentPlugin,
  type MarkdownComponentNode
} from './markdownComponentPlugin';
import type { MarkdownModulePlugin, MarkdownNodePlugin } from './markdownPipeline';
import { createMarkdownShikiPlugin } from './markdownShikiPlugin';

const DEFAULT_QUERY = 'markdown';
const DEFAULT_PREFIX = '\0markdown:';

type MarkdownExitOptionsArgument = MarkdownExitOptions;

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
  const nodePlugins = createMarkdownNodePlugins(options);
  const modulePlugin = markdownComponentModulePlugin;

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

      const markdownRaw = await readFile(filePath, 'utf8');
      const renderer = await (markdownRendererPromise ??= createRenderer(options));
      const nodes = await createMarkdownComponentNodes(markdownRaw, renderer, nodePlugins);

      return renderMarkdownComponentModule(modulePlugin, {
        nodes
      });
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

export {
  createMarkdownShikiPlugin,
  markdownComponentModulePlugin,
  markdownComponentPlugin,
  type MarkdownComponentNode
};

async function createRenderer(options: MarkdownRenderPluginOptions): Promise<MarkdownExit> {
  const markdownOptions: MarkdownExitOptionsArgument = {
    html: false,
    ...options.markdownOptions
  };
  const renderer = createMarkdownExit(markdownOptions);

  renderer.use(markdownComponentPlugin);

  await options.configureMarkdown?.(renderer);

  return renderer;
}

async function createMarkdownComponentNodes(
  markdown: string,
  renderer: MarkdownExit,
  nodePlugins: readonly MarkdownNodePlugin[]
): Promise<MarkdownComponentNode[]> {
  const tokens = renderer.parse(markdown, {});
  const root: { children: MarkdownComponentNode[] } = { children: [] };
  const stack: Array<{ children: MarkdownComponentNode[] }> = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.hidden) {
      continue;
    }

    const pluginNodes = await resolveTokenNodes(nodePlugins, token, { renderer });

    if (pluginNodes) {
      current?.children.push(...pluginNodes);
      continue;
    }

    if (token.type === 'inline') {
      current?.children.push(...(getMarkdownComponentNodes(token) ?? createInlineNodes(token.children ?? [])));
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      current?.children.push(await createCodeBlockNode(token, renderer));
      continue;
    }

    if (token.type === 'html_block') {
      current?.children.push(...(getMarkdownComponentNodes(token) ?? [{ type: 'html', html: token.content }]));
      continue;
    }

    if (token.nesting === 1) {
      const node: MarkdownComponentNode = {
        type: 'element',
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

    if (token.nesting === 0 && token.tag) {
      current?.children.push(createSelfClosingElementNode(token));
    }
  }

  return normalizeMarkdownComponentNodes(root.children);
}

function createMarkdownNodePlugins(options: MarkdownRenderPluginOptions): readonly MarkdownNodePlugin[] {
  return [
    createMarkdownShikiPlugin({
      theme: options.theme,
      themes: options.themes,
      supportedLanguages: options.supportedLanguages,
      defaultLanguage: options.defaultLanguage
    })
  ];
}

function renderMarkdownComponentModule(
  modulePlugin: MarkdownModulePlugin,
  options: { nodes: MarkdownComponentNode[] }
): string {
  return modulePlugin.renderModule(options);
}

async function resolveTokenNodes(
  nodePlugins: readonly MarkdownNodePlugin[],
  token: ReturnType<MarkdownExit['parse']>[number],
  context: { renderer: MarkdownExit }
): Promise<MarkdownComponentNode[] | undefined> {
  for (const plugin of nodePlugins) {
    const nodes = await plugin.resolveNodes(token, context);

    if (nodes) {
      return nodes;
    }
  }

  return undefined;
}

function createInlineNodes(
  tokens: NonNullable<ReturnType<MarkdownExit['parse']>[number]['children']>
): MarkdownComponentNode[] {
  const root: { children: MarkdownComponentNode[] } = { children: [] };
  const stack: Array<{ children: MarkdownComponentNode[] }> = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.hidden) {
      continue;
    }

    if (token.type === 'text') {
      current?.children.push({ type: 'text', value: token.content });
      continue;
    }

    if (token.type === 'code_inline') {
      current?.children.push({
        type: 'element',
        tag: 'code',
        children: [{ type: 'text', value: token.content }]
      });
      continue;
    }

    if (token.type === 'softbreak') {
      current?.children.push({ type: 'text', value: '\n' });
      continue;
    }

    if (token.type === 'hardbreak') {
      current?.children.push({ type: 'element', tag: 'br', children: [] });
      continue;
    }

    if (token.type === 'html_inline') {
      current?.children.push({ type: 'html', html: token.content });
      continue;
    }

    if (token.nesting === 1) {
      const node: MarkdownComponentNode = {
        type: 'element',
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

    if (token.nesting === 0) {
      current?.children.push(createSelfClosingElementNode(token));
    }
  }

  return root.children;
}

function createSelfClosingElementNode(token: ReturnType<MarkdownExit['parse']>[number]): MarkdownComponentNode {
  if (token.content) {
    return {
      type: 'element',
      tag: token.tag,
      attrs: createAttributesObject(token),
      children: [{ type: 'text', value: token.content }]
    };
  }

  return {
    type: 'element',
    tag: token.tag,
    attrs: createAttributesObject(token),
    children: []
  };
}

function normalizeMarkdownComponentNodes(
  nodes: MarkdownComponentNode[],
  parentTag?: string
): MarkdownComponentNode[] {
  const normalizedNodes: MarkdownComponentNode[] = [];

  for (const node of nodes) {
    if (node.type !== 'element') {
      normalizedNodes.push(node);
      continue;
    }

    const children = normalizeMarkdownComponentNodes(node.children, node.tag);

    if (node.tag === 'p' && shouldUnwrapParagraph(parentTag, children)) {
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

function shouldUnwrapParagraph(parentTag: string | undefined, children: MarkdownComponentNode[]): boolean {
  if (parentTag && isComponentTag(parentTag)) {
    return true;
  }

  return shouldUnwrapComponentParagraph(children);
}

function shouldUnwrapComponentParagraph(children: MarkdownComponentNode[]): boolean {
  return children.length > 0 && children.every((child) => child.type === 'element' && isComponentTag(child.tag));
}

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag) || tag.includes('.');
}

function createAttributesObject(token: ReturnType<MarkdownExit['parse']>[number]): Record<string, string> | undefined {
  if (!token.attrs?.length) {
    return undefined;
  }

  return Object.fromEntries(token.attrs);
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
