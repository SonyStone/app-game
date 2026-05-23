import { Plugin } from "vite";

//#region src/index.d.ts
declare const DEFAULT_SUPPORTED_LANGUAGES: readonly ["tsx", "typescript", "jsx", "javascript", "json", "bash", "html", "css", "scss", "markdown", "glsl", "yaml", "toml", "plaintext"];
type DefaultLanguage = (typeof DEFAULT_SUPPORTED_LANGUAGES)[number];
type CodeBlockHighlightPluginOptions = {
  themes?: readonly string[];
  query?: string;
  prefix?: string;
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
  pluginName?: string;
};
type ShikiRendererOptions = {
  themes?: readonly string[];
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
};
type ShikiHighlightOptions = {
  language?: string | null;
  theme?: string;
};
type MdxShikiCodeBlocksOptions = ShikiRendererOptions & {
  componentName?: string;
};
declare function createShikiRenderer(options?: ShikiRendererOptions): {
  highlight(code: string, options?: ShikiHighlightOptions): Promise<{
    html: string;
    language: string;
    theme: string;
  }>;
};
declare function vitePluginShiki(options?: CodeBlockHighlightPluginOptions): Plugin;
declare function createMdxShikiCodeBlocks(options?: MdxShikiCodeBlocksOptions): () => (tree: MdxParentNode) => Promise<void>;
declare function normalizeShikiLanguage(language?: string | null): string | undefined;
type ShikiQueryLanguage = DefaultLanguage;
type MdxJsxAttributeNode = {
  type: 'mdxJsxAttribute';
  name: string;
  value: string;
};
type MdxNode = {
  type: string;
  children?: MdxNode[];
  value?: string;
  lang?: string | null;
  meta?: string | null;
} | MdxJsxFlowElementNode;
type MdxParentNode = {
  children: MdxNode[];
};
type MdxJsxFlowElementNode = {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: MdxJsxAttributeNode[];
  children: [];
};
//#endregion
export { CodeBlockHighlightPluginOptions, DEFAULT_SUPPORTED_LANGUAGES, MdxShikiCodeBlocksOptions, ShikiHighlightOptions, ShikiQueryLanguage, ShikiRendererOptions, createMdxShikiCodeBlocks, createShikiRenderer, normalizeShikiLanguage, vitePluginShiki };