declare module '*?markdown' {
  const MarkdownContent: (props: { components?: Record<string, any> }) => import('solid-js').JSX.Element;
  export default MarkdownContent;
}

declare module '*.md?markdown' {
  export * from '*?markdown';
}

declare module '*.mdx?markdown' {
  export * from '*?markdown';
}

declare module '*?shiki' {
  export const code: string;
  export const language: string;
  export const html: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}

declare module '*.txt?shiki&lang=ts' {
  export const code: string;
  export const language: string;
  export const html: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}

declare module '*.txt?shiki&lang=tsx' {
  export const code: string;
  export const language: string;
  export const html: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}
