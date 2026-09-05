import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [solid({ hot: false, ssr: true })],
  build: {
    emptyOutDir: !isSsrBuild,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: isSsrBuild ? 'server' : 'solid-view-cube',
      cssFileName: 'solid-view-cube'
    },
    rolldownOptions: { external: [/^solid-js(?:\/|$)/, /^@solidjs\//] }
  }
}))
