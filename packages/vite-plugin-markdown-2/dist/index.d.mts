import { ShikiRendererOptions } from "@app-game/vite-plugin-shiki";
import { CompileOptions } from "@mdx-js/mdx";
import { Plugin } from "vite";

//#region src/index.d.ts
type Markdown2CompileOptions = Omit<CompileOptions, 'format' | 'jsxImportSource' | 'remarkPlugins'>;
type Markdown2RenderPluginOptions = {
  query?: string;
  prefix?: string;
  pluginName?: string;
  jsxImportSource?: string;
  themes?: ShikiRendererOptions['themes'];
  supportedLanguages?: ShikiRendererOptions['supportedLanguages'];
  defaultLanguage?: ShikiRendererOptions['defaultLanguage'];
  mdxOptions?: Markdown2CompileOptions;
  remarkPlugins?: NonNullable<CompileOptions['remarkPlugins']>;
  unwrapParagraphsInComponentChildren?: boolean;
};
declare function vitePluginMarkdown2(options?: Markdown2RenderPluginOptions): Plugin;
//#endregion
export { Markdown2RenderPluginOptions, vitePluginMarkdown2 };