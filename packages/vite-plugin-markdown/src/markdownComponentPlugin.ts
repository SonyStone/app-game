import type { MarkdownExit } from 'markdown-exit';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

type MarkdownToken = ReturnType<MarkdownExit['parse']>[number];

export type MarkdownComponentNode =
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

type MarkdownComponentTokenMeta = {
  markdownComponentNodes?: MarkdownComponentNode[];
};

export function markdownComponentPlugin(markdown: MarkdownExit): void {
  markdown.core.ruler.push('markdown_component_nodes', (state) => {
    for (const token of state.tokens) {
      annotateMarkdownComponentToken(token);
    }
  });
}

export function getMarkdownComponentNodes(token: MarkdownToken): MarkdownComponentNode[] | undefined {
  return (token.meta as MarkdownComponentTokenMeta | null | undefined)?.markdownComponentNodes;
}

function annotateMarkdownComponentToken(token: MarkdownToken): void {
  if (token.hidden) {
    return;
  }

  if (token.type === 'inline') {
    const nodes = createInlineComponentNodes(token.children ?? [], token.content);

    if (nodes) {
      setMarkdownComponentNodes(token, nodes);
    }

    return;
  }

  if (token.type === 'html_block') {
    const nodes = parseComponentHtml(token.content);

    if (nodes) {
      setMarkdownComponentNodes(token, nodes);
    }
  }
}

function setMarkdownComponentNodes(token: MarkdownToken, nodes: MarkdownComponentNode[]): void {
  token.meta = {
    ...(token.meta ?? {}),
    markdownComponentNodes: nodes
  };
}

function createInlineComponentNodes(
  tokens: NonNullable<MarkdownToken['children']>,
  content?: string
): MarkdownComponentNode[] | undefined {
  const promotedNodes = tryCreateInlineComponentNodes(tokens, content);

  if (promotedNodes) {
    return promotedNodes;
  }

  const root: { children: MarkdownComponentNode[] } = { children: [] };
  const stack: Array<{ children: MarkdownComponentNode[] }> = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    if (token.hidden) {
      continue;
    }

    if (token.type === 'text') {
      current?.children.push(...createTextLikeNodes(token.content));
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
      current?.children.push(...createHtmlInlineNodes(token.content));
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

  return root.children.some(containsComponentNode) ? root.children : undefined;
}

function tryCreateInlineComponentNodes(
  tokens: NonNullable<MarkdownToken['children']>,
  content?: string
): MarkdownComponentNode[] | undefined {
  if (!content || !content.includes('<') || !canPromoteInlineToken(tokens)) {
    return undefined;
  }

  return parseComponentHtml(content);
}

function canPromoteInlineToken(tokens: NonNullable<MarkdownToken['children']>): boolean {
  return tokens.every(
    (token) =>
      token.hidden ||
      token.type === 'text' ||
      token.type === 'softbreak' ||
      token.type === 'hardbreak' ||
      token.type === 'html_inline'
  );
}

function createTextLikeNodes(value: string): MarkdownComponentNode[] {
  if (!value.includes('<')) {
    return [{ type: 'text', value }];
  }

  return parseComponentHtml(value) ?? [{ type: 'text', value }];
}

function createHtmlInlineNodes(html: string): MarkdownComponentNode[] {
  return parseComponentHtml(html) ?? [{ type: 'html', html }];
}

function createSelfClosingElementNode(token: MarkdownToken): MarkdownComponentNode {
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

function parseComponentHtml(source: string): MarkdownComponentNode[] | undefined {
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const nodes = createHtmlNodes(fragment.childNodes, source);

  if (!nodes || !nodes.some(containsComponentNode)) {
    return undefined;
  }

  return normalizeHtmlLikeNodes(nodes);
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

function containsComponentNode(node: MarkdownComponentNode): boolean {
  if (node.type !== 'element') {
    return false;
  }

  return isComponentTag(node.tag) || node.children.some(containsComponentNode);
}

function createHtmlNodes(
  childNodes: DefaultTreeAdapterTypes.ChildNode[],
  source: string
): MarkdownComponentNode[] | undefined {
  const nodes: MarkdownComponentNode[] = [];

  for (const childNode of childNodes) {
    const node = createHtmlNode(childNode, source);

    if (node == null) {
      return undefined;
    }

    if (Array.isArray(node)) {
      nodes.push(...node);
      continue;
    }

    nodes.push(node);
  }

  return nodes;
}

function createHtmlNode(
  childNode: DefaultTreeAdapterTypes.ChildNode,
  source: string
): MarkdownComponentNode | MarkdownComponentNode[] | undefined {
  switch (childNode.nodeName) {
    case '#text':
      return { type: 'text', value: childNode.value };
    case '#comment':
      return { type: 'html', html: `<!--${childNode.data}-->` };
    case '#documentType':
      return { type: 'html', html: `<!DOCTYPE ${childNode.name}>` };
    default:
      return createHtmlElementNode(childNode, source);
  }
}

function createHtmlElementNode(
  element: DefaultTreeAdapterTypes.Element | DefaultTreeAdapterTypes.Template,
  source: string
): MarkdownComponentNode | undefined {
  const tag = getOriginalTagName(element, source);
  const attrs = createHtmlAttributesObject(element, source);

  if (!tag || attrs === null) {
    return undefined;
  }

  const childNodes = 'content' in element ? element.content.childNodes : element.childNodes;
  const children = createHtmlNodes(childNodes, source);

  if (!children) {
    return undefined;
  }

  return {
    type: 'element',
    tag,
    attrs,
    children
  };
}

function getOriginalTagName(
  element: DefaultTreeAdapterTypes.Element | DefaultTreeAdapterTypes.Template,
  source: string
): string | undefined {
  const startTag = element.sourceCodeLocation?.startTag;

  if (!startTag) {
    return element.tagName;
  }

  const rawStartTag = source.slice(startTag.startOffset, startTag.endOffset);

  return /^<\s*([^\s/>]+)/.exec(rawStartTag)?.[1] ?? element.tagName;
}

function createHtmlAttributesObject(
  element: DefaultTreeAdapterTypes.Element | DefaultTreeAdapterTypes.Template,
  source: string
): Record<string, string> | undefined | null {
  if (element.attrs.length === 0) {
    return undefined;
  }

  const locationAttrs = element.sourceCodeLocation?.attrs;
  const attrs: Record<string, string> = {};

  for (const attr of element.attrs) {
    const location = locationAttrs?.[attr.name];
    const name = location ? source.slice(location.startOffset, location.endOffset).split('=')[0]?.trim() : attr.name;

    if (!name) {
      return null;
    }

    attrs[name] = attr.value;
  }

  return attrs;
}

function createAttributesObject(token: MarkdownToken): Record<string, string> | undefined {
  if (!token.attrs?.length) {
    return undefined;
  }

  return Object.fromEntries(token.attrs);
}
