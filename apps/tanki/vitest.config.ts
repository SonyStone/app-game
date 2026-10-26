import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    include: ['src/**/*.test.ts'],
    // Rapier imports its WebAssembly module from JavaScript, which only the wasm plugin can load.
    server: { deps: { inline: [/@dimforge/] } },
    env: tuningFile(process.env.TANKI_TUNING)
  }
});

/**
 * `TANKI_TUNING` for the harnesses, which read a tuning exported from the game's pause menu from
 * it (see `harnessTuning` in `src/koth/tuning.ts`): when it names a file, the file's text instead
 * of its name; otherwise it stays as it is, the tuning's JSON, a link or a link's code.
 */
function tuningFile(value: string | undefined): Record<string, string> {
  return value && existsSync(value) ? { TANKI_TUNING: readFileSync(value, 'utf8') } : {};
}
