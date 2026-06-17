import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
  ],
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
});