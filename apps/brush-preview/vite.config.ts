import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import typegpu from 'unplugin-typegpu/vite';

/** The embed demonstration intentionally bundles no Paint UI, ABR editor or original brush packs. */
export default defineConfig({ plugins: [solid(), typegpu(), {
  name: 'standalone-preview-check',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue;
      for (const [id, module] of Object.entries(output.modules))
        if (module.renderedLength && /\/(apps\/(paint|abr-viewer)|packages\/abr-parser)\//.test(id))
          this.error(`Preview must not ship editor or ABR parser code: ${id}`);
    }
  }
}], build: { target: 'esnext' } });
