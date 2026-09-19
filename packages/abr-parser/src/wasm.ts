import { initialized, loadAbr } from './lazy.js';
import type { AbrParser } from './types.js';
export { degrees, percent, pixels } from '../wasm/dist/brands.js';
export { loadAbr } from './lazy.js';
export type { AbrBackend } from './lazy.js';
export type * from './types.js';

/** Lazily loads the wasm backend. Call once before synchronous operations. */
export const initAbr: AbrParser['initAbr'] = async (input) => {
  await loadAbr('wasm', input);
};
/** Reads brushes, hierarchy and resource metadata without decoding images. Requires initAbr. */
export const parseAbr: AbrParser['parseAbr'] = (...args) => initialized('wasm').parseAbr(...args);
/** Writes supported field edits while preserving untouched source bytes. Requires initAbr. */
export const writeAbr: AbrParser['writeAbr'] = (...args) => initialized('wasm').writeAbr(...args);
/** Authors a computed brush set with complete typed tip parameters. Requires initAbr. */
export const createAbr: AbrParser['createAbr'] = (...args) => initialized('wasm').createAbr(...args);
/** Decodes native plane bytes, retaining depth and storage byte order. Requires initAbr. */
export const readPlane: AbrParser['readPlane'] = (...args) => initialized('wasm').readPlane(...args);
/** Copies a standalone encoded sample without archive framing. Requires initAbr. */
export const sampleBytes: AbrParser['sampleBytes'] = (...args) => initialized('wasm').sampleBytes(...args);
/** Decodes the ordinary mask from a standalone sample payload. Requires initAbr. */
export const readSamplePlane: AbrParser['readSamplePlane'] = (...args) => initialized('wasm').readSamplePlane(...args);
/** Resolves current primary, dual and texture references by ID or name. Requires initAbr. */
export const resolveResources: AbrParser['resolveResources'] = (...args) =>
  initialized('wasm').resolveResources(...args);
/** Copies a compressed resource without retaining the archive buffer. Requires initAbr. */
export const resourceSource: AbrParser['resourceSource'] = (...args) => initialized('wasm').resourceSource(...args);
/** Normalizes one compressed resource within the decoded-byte budget. Requires initAbr. */
export const decodeResource: AbrParser['decodeResource'] = (...args) => initialized('wasm').decodeResource(...args);
/** Reads a library and prepares shared primary masks within an aggregate budget. Requires initAbr. */
export const readLibrary: AbrParser['readLibrary'] = (...args) => initialized('wasm').readLibrary(...args);
/** Writes an explicit selection, order and folder hierarchy from source documents. Requires initAbr. */
export const composeAbr: AbrParser['composeAbr'] = (...args) => initialized('wasm').composeAbr(...args);
