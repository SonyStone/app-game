import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ root: '../..' }), solid(), tailwindcss()],
  server: {
    host: '0.0.0.0'
  },
  resolve: {
    alias: {
      '~': '/src'
    }
  }
});
