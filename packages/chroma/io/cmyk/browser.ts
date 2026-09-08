import wasmUrl from '@kittl/little-cms/wasm?url';
import { createCmykProfile } from './cmykProfile';

/** Loads LittleCMS through Vite's asset pipeline; the ICC file remains local to this browser. */
export function createBrowserCmykProfile(bytes: Uint8Array) {
  return createCmykProfile(bytes, wasmUrl);
}
