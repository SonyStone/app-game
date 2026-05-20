declare module '*.txt?shiki&lang=ts' {
  export const code: string;
  export const language: string;

  const highlightedHtml: string;
  export default highlightedHtml;
}
