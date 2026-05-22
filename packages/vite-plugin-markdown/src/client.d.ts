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
