declare module '*?markdown' {
  export const markdown: string;
  export const html: string;

  const renderedHtml: string;
  export default renderedHtml;
}

declare module '*.md?markdown' {
  export const markdown: string;
  export const html: string;

  const renderedHtml: string;
  export default renderedHtml;
}

declare module '*?markdown&blocks' {
  export type MarkdownBlock =
    | {
        type: 'paragraph';
        html: string;
        text: string;
      }
    | {
        type: 'heading';
        html: string;
        text: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
        id?: string;
      }
    | {
        type: 'codeblock';
        html: string;
        code: string;
        language?: string;
        meta?: string;
      }
    | {
        type: 'list' | 'blockquote' | 'html';
        html: string;
      };

  export const markdown: string;
  export const html: string;
  export const blocks: MarkdownBlock[];

  const renderedHtml: string;
  export default renderedHtml;
}

declare module '*.md?markdown&blocks' {
  export type MarkdownBlock =
    | {
        type: 'paragraph';
        html: string;
        text: string;
      }
    | {
        type: 'heading';
        html: string;
        text: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
        id?: string;
      }
    | {
        type: 'codeblock';
        html: string;
        code: string;
        language?: string;
        meta?: string;
      }
    | {
        type: 'list' | 'blockquote' | 'html';
        html: string;
      };

  export const markdown: string;
  export const html: string;
  export const blocks: MarkdownBlock[];

  const renderedHtml: string;
  export default renderedHtml;
}

declare module '*?markdown&component' {
  export const markdown: string;
  export const html: string;

  const MarkdownContent: (props: { components?: Record<string, any> }) => import('solid-js').JSX.Element;
  export default MarkdownContent;
}

declare module '*.md?markdown&component' {
  export * from '*?markdown&component';
}

declare module '*?markdown&component&blocks' {
  export * from '*?markdown&component';

  export type MarkdownBlock =
    | {
        type: 'paragraph';
        html: string;
        text: string;
      }
    | {
        type: 'heading';
        html: string;
        text: string;
        level: 1 | 2 | 3 | 4 | 5 | 6;
        id?: string;
      }
    | {
        type: 'codeblock';
        html: string;
        code: string;
        language?: string;
        meta?: string;
      }
    | {
        type: 'list' | 'blockquote' | 'html';
        html: string;
      };

  export const blocks: MarkdownBlock[];
}

declare module '*.md?markdown&component&blocks' {
  export * from '*?markdown&component&blocks';
}
