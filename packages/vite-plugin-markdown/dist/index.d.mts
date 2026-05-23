import { MarkdownExit, MarkdownExitOptions } from "markdown-exit";
import { ShikiRendererOptions } from "@app-game/vite-plugin-shiki";
import { Plugin } from "vite";

//#region src/markdownComponentPlugin.d.ts
type MarkdownComponentNode = {
  type: 'text';
  value: string;
} | {
  type: 'element';
  tag: string;
  attrs?: Record<string, string>;
  children: MarkdownComponentNode[];
} | {
  type: 'codeblock';
  code: string;
  language?: string;
  meta?: string;
  html: string;
  title?: string;
} | {
  type: 'html';
  html: string;
};
declare function markdownComponentPlugin(markdown: MarkdownExit): void;
//#endregion
//#region src/markdownPipeline.d.ts
type MarkdownToken = ReturnType<MarkdownExit['parse']>[number];
type MarkdownNodePluginContext = {
  renderer: MarkdownExit;
};
type MarkdownNodePlugin = {
  resolveNodes: (token: MarkdownToken, context: MarkdownNodePluginContext) => Promise<MarkdownComponentNode[] | undefined> | MarkdownComponentNode[] | undefined;
};
type MarkdownModulePlugin = {
  renderModule: (options: {
    nodes: MarkdownComponentNode[];
  }) => string;
};
//#endregion
//#region src/markdownComponentModulePlugin.d.ts
declare const markdownComponentModulePlugin: MarkdownModulePlugin;
//#endregion
//#region src/markdownShikiPlugin.d.ts
type MarkdownShikiPluginOptions = ShikiRendererOptions & {
  theme?: string;
};
declare function createMarkdownShikiPlugin(options?: MarkdownShikiPluginOptions): MarkdownNodePlugin;
//#endregion
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
export { type MarkdownComponentNode, MarkdownRenderPluginOptions, createMarkdownShikiPlugin, markdownComponentModulePlugin, markdownComponentPlugin, vitePluginMarkdown };