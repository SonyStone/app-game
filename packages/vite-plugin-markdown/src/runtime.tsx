import { createComponent, type JSX } from 'solid-js';
import { Dynamic, template } from 'solid-js/web';

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

export type MarkdownRuntimeComponents = Record<string, any> & {
  wrapper?: (props: { children: JSX.Element }) => JSX.Element;
  HtmlBlock?: (props: { html: string }) => JSX.Element;
  ShikiCodeBlock?: (props: { code: string; language?: string; html: string; meta?: string; title?: string }) => JSX.Element;
  CodeBlock?: (props: { code: string; language?: string; html: string; meta?: string; title?: string }) => JSX.Element;
};

export type MarkdownRuntimeProps = {
  components?: MarkdownRuntimeComponents;
};

export function renderMarkdownDocument(
  nodes: MarkdownComponentNode[],
  props: MarkdownRuntimeProps = {}
): JSX.Element {
  const components = props.components ?? {};
  const content = renderNodes(nodes, components);
  const Wrapper = components.wrapper;

  if (!Wrapper) {
    return content as unknown as JSX.Element;
  }

  return createComponent(Dynamic, {
    component: Wrapper,
    get children() {
      return content;
    }
  });
}

function renderNodes(nodes: MarkdownComponentNode[], components: MarkdownRuntimeComponents): JSX.Element {
  return nodes.map((node) => renderNode(node, components));
}

function renderNode(node: MarkdownComponentNode, components: MarkdownRuntimeComponents): JSX.Element {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'html': {
      const HtmlBlock = components.HtmlBlock ?? DefaultHtmlBlock;

      return createComponent(Dynamic, { component: HtmlBlock, html: node.html });
    }
    case 'codeblock': {
      const CodeBlock = components.ShikiCodeBlock ?? components.CodeBlock ?? DefaultShikiCodeBlock;

      return createComponent(Dynamic, {
        component: CodeBlock,
        code: node.code,
        language: node.language,
        html: node.html,
        meta: node.meta,
        title: node.title
      });
    }
    case 'element': {
      const Component = components[node.tag] ?? node.tag;

      return createComponent(Dynamic, {
        component: Component,
        ...node.attrs,
        get children() {
          return renderNodes(node.children, components);
        }
      });
    }
  }
}

function DefaultHtmlBlock(props: { html: string }): JSX.Element {
  return template(props.html)();
}

function DefaultShikiCodeBlock(props: { html: string }): JSX.Element {
  return template(props.html)();
}