import type { AbrParser } from './types.js';

/** Independent implementations with the same portable document and image contract. */
export type AbrBackend = 'js' | 'wasm';
/** Loads only the selected implementation and initializes it once. A failed attempt can retry.
 * Node WASM callers must supply bytes; browser callers may use the adjacent asset URL. */
export async function loadAbr(
  backend: AbrBackend = 'js',
  input?: Parameters<AbrParser['initAbr']>[0]
): Promise<AbrParser> {
  if (!Object.hasOwn(states, backend)) throw new Error('Unknown ABR backend');
  const state = states[backend];
  state.pending ??= imports[backend]()
    .then(async (runtime) => {
      await runtime.initAbr(input);
      state.runtime = runtime;
      return runtime;
    })
    .catch((error) => {
      delete state.pending;
      throw error;
    });
  return state.pending;
}
/** For synchronous calls after explicit initialization. Importing this module loads neither backend. */
export function initialized(backend: AbrBackend): AbrParser {
  const runtime = states[backend].runtime;
  if (!runtime) throw new Error('Call and await initAbr before using the ABR parser');
  return runtime;
}
type State = { runtime?: AbrParser; pending?: Promise<AbrParser> };
const states: Record<AbrBackend, State> = { js: {}, wasm: {} };
const imports = {
  js: () => import('./js/abr-js-runtime.js'),
  wasm: () => import('../wasm/dist/index.js')
} satisfies Record<AbrBackend, () => Promise<AbrParser>>;
