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
declare function createShikiRenderer(options?: ShikiRendererOptions): {
  highlight(code: string, options?: ShikiHighlightOptions): Promise<{
    html: string;
    language: string;
    theme: string;
  }>;
};
declare function vitePluginShiki(options?: CodeBlockHighlightPluginOptions): Plugin;
declare function normalizeShikiLanguage(language?: string | null): string | undefined;
type ShikiQueryLanguage = DefaultLanguage;
//#endregion
export { CodeBlockHighlightPluginOptions, DEFAULT_SUPPORTED_LANGUAGES, ShikiHighlightOptions, ShikiQueryLanguage, ShikiRendererOptions, createShikiRenderer, normalizeShikiLanguage, vitePluginShiki };