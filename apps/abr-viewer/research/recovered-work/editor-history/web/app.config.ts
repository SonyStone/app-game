import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  ssr: false, // Client-side only static site
  server: {
    prerender: {
      crawlLinks: true,
    },
  },
  vite: {
    optimizeDeps: {
      // Include abr-parser in pre-bundling for proper handling
      include: ['abr-parser'],
    },
  },
});

