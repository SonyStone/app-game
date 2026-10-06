import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    server: {
      deps: {
        // Bundle Solid Primitives like the app does, so they import the browser build of @solidjs/web; externalized,
        // they get the server build, where isServer turns timers such as debounce into no-ops.
        inline: [/@solid-primitives\//]
      }
    }
  },
  resolve: {
    conditions: ['development', 'browser']
  }
});
