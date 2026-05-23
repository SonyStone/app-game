import { createShikiRenderer, normalizeShikiLanguage, type ShikiRendererOptions } from '@app-game/vite-plugin-shiki';
import type { MarkdownExit, MarkdownExitOptions } from 'markdown-exit';
import { createMarkdownExit } from 'markdown-exit';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

const DEFAULT_QUERY = 'markdown';
const DEFAULT_PREFIX = '\0markdown:';

type MarkdownExitOptionsArgument = MarkdownExitOptions;

type MarkdownCodeBlock = {
  type: 'codeblock';
  code: string;
  language?: string;
  meta?: string;
  html: string;
};

type MarkdownComponentNode =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'element';
      tag: string;
      attrs?: Record<string, string>;
      children: MarkdownComponentNode[];
    }
  | {
      type: 'codeblock';
      code: string;
      language?: string;
      meta?: string;
      html: string;
      title?: string;
    }
  | {
      type: 'html';
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
      const [filePath] = resolvedId.split('?', 2);

      trackVirtualId(virtualIdsByFile, filePath, id);

      this.addWatchFile(filePath);

      const markdownRaw = await readFile(filePath, 'utf8');
      const renderer = await (markdownRendererPromise ??= createRenderer(options));
      const nodes = await createMarkdownComponentNodes(markdownRaw, renderer);

      return createMarkdownComponentModule({
        markdown: markdownRaw,
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

async function createMarkdownComponentNodes(
  markdown: string,
  renderer: MarkdownExit
): Promise<MarkdownComponentNode[]> {
  const tokens = renderer.parse(markdown, {});
  const root: { children: MarkdownComponentNode[] } = { children: [] };
  const stack: Array<{ children: MarkdownComponentNode[] }> = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.hidden) {
      continue;
    }

    if (token.type === 'inline') {
      current?.children.push(...createInlineNodes(token.children ?? []));
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      current?.children.push(await createCodeBlockNode(token, renderer));
      continue;
    }

    if (token.type === 'html_block') {
      current?.children.push(...createHtmlLikeNodes(token.content));
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

  return root.children;
}

function createMarkdownComponentModule(options: { markdown: string; nodes: MarkdownComponentNode[] }): string {
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
  ].join('\n');
}

function createChildrenExpression(nodes: MarkdownComponentNode[]): string {
  if (nodes.length === 0) {
    return 'undefined';
  }

  if (nodes.length === 1) {
    return createNodeExpression(nodes[0]);
  }

  return `[${nodes.map((node) => createNodeExpression(node)).join(', ')}]`;
}

function createNodeExpression(node: MarkdownComponentNode): string {
  switch (node.type) {
    case 'text':
      return JSON.stringify(node.value);
    case 'html':
      return `createComponent(Dynamic, { component: components.HtmlBlock ?? _DefaultHtmlBlock, html: ${JSON.stringify(node.html)} })`;
    case 'codeblock':
      return [
        `createComponent(Dynamic, {`,
        `component: components.ShikiCodeBlock ?? components.CodeBlock ?? _DefaultShikiCodeBlock,`,
        `code: ${JSON.stringify(node.code)},`,
        `language: ${serializeOptionalValue(node.language)},`,
        `html: ${JSON.stringify(node.html)},`,
        `meta: ${serializeOptionalValue(node.meta)},`,
        `title: ${serializeOptionalValue(node.title)}`,
        `})`
      ].join(' ');
    case 'element': {
      const properties = [`component: components[${JSON.stringify(node.tag)}] ?? ${JSON.stringify(node.tag)}`];

      for (const [key, value] of Object.entries(node.attrs ?? {})) {
        properties.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
      }

      if (node.children.length > 0) {
        properties.push(`get children() { return ${createChildrenExpression(node.children)}; }`);
      }

      return `createComponent(Dynamic, { ${properties.join(', ')} })`;
    }
  }
}

function serializeOptionalValue(value: string | undefined): string {
  return value == null ? 'undefined' : JSON.stringify(value);
}

async function createCodeBlock(
  token: ReturnType<MarkdownExit['parse']>[number],
  renderer: MarkdownExit
): Promise<MarkdownCodeBlock> {
  const [rawLanguage = '', ...metaParts] = token.info.trim().split(/\s+/).filter(Boolean);

  return {
    type: 'codeblock',
    code: token.content,
    language: normalizeShikiLanguage(rawLanguage) ?? (rawLanguage || undefined),
    meta: metaParts.length > 0 ? metaParts.join(' ') : undefined,
    html: await renderer.renderer.renderAsync([token], renderer.options, {})
  };
}

async function createCodeBlockNode(
  token: ReturnType<MarkdownExit['parse']>[number],
  renderer: MarkdownExit
): Promise<MarkdownComponentNode> {
  const block = await createCodeBlock(token, renderer);

  return {
    type: 'codeblock',
    code: block.code,
    language: block.language,
    meta: block.meta,
    html: block.html,
    title: extractTitleFromMeta(block.meta)
  };
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
      current?.children.push(...createHtmlLikeNodes(token.content));
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

function createHtmlLikeNodes(html: string): MarkdownComponentNode[] {
  const parsedNodes = parseComponentHtml(html);

  if (parsedNodes) {
    return parsedNodes;
  }

  return [{ type: 'html', html }];
}

function parseComponentHtml(source: string): MarkdownComponentNode[] | undefined {
  const root: { children: MarkdownComponentNode[] } = { children: [] };
  const stack: Array<{ tag?: string; children: MarkdownComponentNode[] }> = [root];
  let cursor = 0;
  let foundComponent = false;

  while (cursor < source.length) {
    const nextTagIndex = source.indexOf('<', cursor);

    if (nextTagIndex === -1) {
      appendTextNode(stack[stack.length - 1]?.children, source.slice(cursor));
      break;
    }

    if (nextTagIndex > cursor) {
      appendTextNode(stack[stack.length - 1]?.children, source.slice(cursor, nextTagIndex));
    }

    const parsedTag = parseHtmlTag(source, nextTagIndex);

    if (!parsedTag) {
      return undefined;
    }

    cursor = parsedTag.endIndex;

    if (parsedTag.kind === 'close') {
      const openNode = stack.pop();

      if (!openNode?.tag || openNode.tag !== parsedTag.tag) {
        return undefined;
      }

      continue;
    }

    const node: MarkdownComponentNode = {
      type: 'element',
      tag: parsedTag.tag,
      attrs: parsedTag.attrs,
      children: []
    };

    stack[stack.length - 1]?.children.push(node);

    if (isComponentTag(parsedTag.tag)) {
      foundComponent = true;
    }

    if (!parsedTag.selfClosing) {
      stack.push(node);
    }
  }

  if (stack.length !== 1 || !foundComponent) {
    return undefined;
  }

  return normalizeHtmlLikeNodes(root.children);
}

function appendTextNode(target: MarkdownComponentNode[] | undefined, value: string): void {
  if (!target || value.length === 0) {
    return;
  }

  target.push({
    type: 'text',
    value
  });
}

function normalizeHtmlLikeNodes(nodes: MarkdownComponentNode[]): MarkdownComponentNode[] {
  const normalizedNodes: MarkdownComponentNode[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.value.trim().length === 0) {
        continue;
      }

      normalizedNodes.push(node);
      continue;
    }

    if (node.type === 'element') {
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

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag) || tag.includes('.');
}

function parseHtmlTag(
  source: string,
  startIndex: number
):
  | {
      kind: 'open';
      tag: string;
      attrs?: Record<string, string>;
      selfClosing: boolean;
      endIndex: number;
    }
  | {
      kind: 'close';
      tag: string;
      endIndex: number;
    }
  | undefined {
  if (source[startIndex] !== '<') {
    return undefined;
  }

  let index = startIndex + 1;
  let quote: '"' | "'" | undefined;

  while (index < source.length) {
    const character = source[index];

    if (quote) {
      if (character === quote) {
        quote = undefined;
      }

      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      index += 1;
      continue;
    }

    if (character === '>') {
      break;
    }

    index += 1;
  }

  if (index >= source.length) {
    return undefined;
  }

  const rawTag = source.slice(startIndex + 1, index).trim();

  if (rawTag.length === 0 || rawTag.startsWith('!') || rawTag.startsWith('?')) {
    return undefined;
  }

  if (rawTag.startsWith('/')) {
    const tag = rawTag.slice(1).trim();

    if (!isValidHtmlTagName(tag)) {
      return undefined;
    }

    return {
      kind: 'close',
      tag,
      endIndex: index + 1
    };
  }

  const selfClosing = rawTag.endsWith('/');
  const content = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
  const tagMatch = /^([A-Za-z][A-Za-z0-9:._-]*)(?:\s+([\s\S]*))?$/.exec(content);

  if (!tagMatch) {
    return undefined;
  }

  const tag = tagMatch[1];

  if (!isValidHtmlTagName(tag)) {
    return undefined;
  }

  const attrs = parseHtmlAttributes(tagMatch[2] ?? '');

  if (attrs === null) {
    return undefined;
  }

  return {
    kind: 'open',
    tag,
    attrs,
    selfClosing,
    endIndex: index + 1
  };
}

function parseHtmlAttributes(source: string): Record<string, string> | undefined | null {
  const attrs: Record<string, string> = {};
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (index >= source.length) {
      break;
    }

    const nameStart = index;

    while (index < source.length && /[^\s=]/.test(source[index])) {
      index += 1;
    }

    const name = source.slice(nameStart, index);

    if (!isValidHtmlAttributeName(name)) {
      return null;
    }

    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (source[index] !== '=') {
      attrs[name] = 'true';
      continue;
    }

    index += 1;

    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (index >= source.length) {
      return null;
    }

    const quote = source[index];

    if (quote === '"' || quote === "'") {
      index += 1;

      const valueStart = index;

      while (index < source.length && source[index] !== quote) {
        index += 1;
      }

      if (index >= source.length) {
        return null;
      }

      attrs[name] = source.slice(valueStart, index);
      index += 1;
      continue;
    }

    const valueStart = index;

    while (index < source.length && /[^\s]/.test(source[index])) {
      index += 1;
    }

    attrs[name] = source.slice(valueStart, index);
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function isValidHtmlTagName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9:._-]*$/.test(value);
}

function isValidHtmlAttributeName(value: string): boolean {
  return /^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(value);
}

function createAttributesObject(token: ReturnType<MarkdownExit['parse']>[number]): Record<string, string> | undefined {
  if (!token.attrs?.length) {
    return undefined;
  }

  return Object.fromEntries(token.attrs);
}

function extractTitleFromMeta(meta?: string): string | undefined {
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
