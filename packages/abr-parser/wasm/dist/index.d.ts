import type * as Runtime from "./abr-wasm-runtime.js";
import type { InitInput } from "../pkg/photoshop_abr_wasm.js";
export type * from "./abr-wasm-runtime.js";
export { percent, degrees, pixels } from "./brands.js";
/** Lazily loads the JS bridge and WASM. Parallel calls share initialization; failures can retry. */
export declare function initAbr(input?: InitInput | Promise<InitInput>): Promise<void>;
/** Reads brushes, hierarchy and resource metadata without decoding images. Requires initAbr. */
export declare const parseAbr: typeof Runtime.parseAbr;
/** Writes supported field edits while preserving untouched source bytes. Requires initAbr. */
export declare const writeAbr: typeof Runtime.writeAbr;
/** Authors a computed brush set with complete typed tip parameters. Requires initAbr. */
export declare const createAbr: typeof Runtime.createAbr;
/** Decodes native plane bytes, retaining depth and storage byte order. Requires initAbr. */
export declare const readPlane: typeof Runtime.readPlane;
/** Copies a standalone encoded sample without archive framing. Requires initAbr. */
export declare const sampleBytes: typeof Runtime.sampleBytes;
/** Decodes the ordinary mask from a standalone sample payload. Requires initAbr. */
export declare const readSamplePlane: typeof Runtime.readSamplePlane;
/** Resolves current primary, dual and texture references by ID or name. Requires initAbr. */
export declare const resolveResources: typeof Runtime.resolveResources;
/** Copies a compressed resource without retaining the archive buffer. Requires initAbr. */
export declare const resourceSource: typeof Runtime.resourceSource;
/** Normalizes one compressed resource within the decoded-byte budget. Requires initAbr. */
export declare const decodeResource: typeof Runtime.decodeResource;
/** Reads a library and prepares shared primary masks within an aggregate budget. Requires initAbr. */
export declare const readLibrary: typeof Runtime.readLibrary;
/** Writes an explicit selection, order and folder hierarchy from source documents. Requires initAbr. */
export declare const composeAbr: typeof Runtime.composeAbr;
