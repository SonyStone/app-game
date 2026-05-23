import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime.tsx'],
  format: ['esm'],
  dts: true,
  clean: true,
  platform: 'node',
  target: 'node20'
});
