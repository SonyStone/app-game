import { ShikiRendererOptions } from "@app-game/vite-plugin-shiki";
import { MarkdownExit, MarkdownExitOptions } from "markdown-exit";
import { Plugin } from "vite";

//#region src/index.d.ts
type MarkdownExitOptionsArgument = MarkdownExitOptions;
type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  theme?: string;
  themes?: ShikiRendererOptions['themes'];
  supportedLanguages?: ShikiRendererOptions['supportedLanguages'];
  defaultLanguage?: ShikiRendererOptions['defaultLanguage'];
  markdownOptions?: MarkdownExitOptionsArgument;
  configureMarkdown?: (markdown: MarkdownExit) => void | Promise<void>;
};
declare function vitePluginMarkdown(options?: MarkdownRenderPluginOptions): Plugin;
//#endregion
export { MarkdownRenderPluginOptions, vitePluginMarkdown };