/** Shared readable contract; type exports never load either parser implementation. */
export type * from '../wasm/dist/index.js';
/** Both implementations obey this complete operational interface. */
export type AbrParser = typeof import('../wasm/dist/index.js');
