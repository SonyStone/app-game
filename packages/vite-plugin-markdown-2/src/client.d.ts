declare module '*?markdown2' {
  const Markdown2Content: (props: { components?: Record<string, any> }) => import('solid-js').JSX.Element;
  export default Markdown2Content;
}

declare module '*.md?markdown2' {
  export * from '*?markdown2';
}
