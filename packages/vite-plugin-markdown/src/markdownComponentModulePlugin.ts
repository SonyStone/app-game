import type { MarkdownComponentNode } from './markdownComponentPlugin';
import type { MarkdownModulePlugin } from './markdownPipeline';

export const markdownComponentModulePlugin: MarkdownModulePlugin = {
  renderModule(options) {
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
};

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
