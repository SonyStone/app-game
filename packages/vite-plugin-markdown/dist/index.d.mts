import { ShikiRendererOptions } from "@app-game/vite-plugin-shiki";
import { MarkdownExit, MarkdownExitOptions } from "markdown-exit";
import { Plugin } from "vite";

//#region src/index.d.ts
type MarkdownExitOptionsArgument = MarkdownExitOptions;
type MarkdownBlock = {
  type: 'paragraph';
  tag: 'p';
  html: string;
  text: string;
} | {
  type: 'heading';
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  html: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id?: string;
} | {
  type: 'codeblock';
  tag: 'pre';
  html: string;
  code: string;
  language?: string;
  meta?: string;
} | {
  type: 'list' | 'blockquote' | 'html';
  tag: 'ul' | 'ol' | 'blockquote' | null;
  html: string;
};
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
export { MarkdownBlock, MarkdownRenderPluginOptions, vitePluginMarkdown };