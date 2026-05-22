import { MarkdownExit, createMarkdownExit } from "markdown-exit";
import { Plugin } from "vite";

//#region src/index.d.ts
type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  markdownOptions?: Parameters<typeof createMarkdownExit>[0];
  configureMarkdown?: (markdown: MarkdownExit) => void | Promise<void>;
};
declare function vitePluginMarkdown(options?: MarkdownRenderPluginOptions): Plugin;
//#endregion
export { MarkdownRenderPluginOptions, vitePluginMarkdown };