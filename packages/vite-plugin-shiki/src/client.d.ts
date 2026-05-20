declare module '*?shiki' {
  export const code: string;
  export const language: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}

declare module '*.txt?shiki&lang=ts' {
  export const code: string;
  export const language: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}

declare module '*.txt?shiki&lang=tsx' {
  export const code: string;
  export const language: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}
