import { vitePluginMarkdown } from '@app-game/vite-plugin-markdown';
import { createMdxShikiCodeBlocks, vitePluginShiki } from '@app-game/vite-plugin-shiki';
import mdx from '@mdx-js/rollup';
import UnoCSS from '@unocss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    vitePluginMarkdown(),
    vitePluginShiki(),
    {
      ...mdx({
        include: /\.mdx$/,
        jsxImportSource: 'solid-js/h',
        remarkPlugins: [createMdxShikiCodeBlocks()]
      }),
      enforce: 'pre'
    },
    tsconfigPaths({ root: '../..' }),
    solid(),
    UnoCSS({
      configFile: fileURLToPath(new URL('../../uno.config.ts', import.meta.url))
    })
  ],
  server: {
    host: '0.0.0.0'
  }
});
