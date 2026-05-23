declare module '*?markdown' {
  const MarkdownContent: (props: { components?: Record<string, any> }) => import('solid-js').JSX.Element;
  export default MarkdownContent;
}

declare module '*.md?markdown' {
  export * from '*?markdown';
}
