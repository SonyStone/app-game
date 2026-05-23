import { ShikiRendererOptions } from "@app-game/vite-plugin-shiki";
import { CompileOptions } from "@mdx-js/mdx";
import { Plugin } from "vite";

//#region src/index.d.ts
type MarkdownCompileOptions = Omit<CompileOptions, 'format' | 'jsxImportSource' | 'remarkPlugins'>;
type MarkdownRenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  jsxImportSource?: string;
  themes?: ShikiRendererOptions['themes'];
  supportedLanguages?: ShikiRendererOptions['supportedLanguages'];
  defaultLanguage?: ShikiRendererOptions['defaultLanguage'];
  mdxOptions?: MarkdownCompileOptions;
  remarkPlugins?: NonNullable<CompileOptions['remarkPlugins']>;
  unwrapParagraphsInComponentChildren?: boolean;
};
declare function vitePluginMarkdown(options?: MarkdownRenderPluginOptions): Plugin;
//#endregion
export { MarkdownRenderPluginOptions, vitePluginMarkdown };