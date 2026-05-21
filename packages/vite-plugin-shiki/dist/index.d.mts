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
declare function vitePluginShiki(options?: CodeBlockHighlightPluginOptions): Plugin;
type ShikiQueryLanguage = DefaultLanguage;
//#endregion
export { CodeBlockHighlightPluginOptions, ShikiQueryLanguage, vitePluginShiki };