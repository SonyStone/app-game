import presetWind from '@unocss/preset-wind';
import { defineConfig } from '@unocss/vite';
import transformerCompileClass from '@unocss/transformer-compile-class'

export default defineConfig({
  presets: [presetWind()],
  rules: [],
  transformers: [
    transformerCompileClass(),
  ],
});
