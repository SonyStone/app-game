export { percent, degrees, pixels } from "./brands.js";
/** Lazily loads the JS bridge and WASM. Parallel calls share initialization; failures can retry. */
export async function initAbr(input) {
    pending ??= import("./abr-wasm-runtime.js")
        .then(async (value) => {
        await value.initAbr(input);
        runtime = value;
    })
        .catch((error) => {
        pending = undefined;
        throw error;
    });
    await pending;
}
/** Reads brushes, hierarchy and resource metadata without decoding images. Requires initAbr. */
export const parseAbr = (...args) => loaded().parseAbr(...args);
/** Writes supported field edits while preserving untouched source bytes. Requires initAbr. */
export const writeAbr = (...args) => loaded().writeAbr(...args);
/** Authors a computed brush set with complete typed tip parameters. Requires initAbr. */
export const createAbr = (...args) => loaded().createAbr(...args);
/** Decodes native plane bytes, retaining depth and storage byte order. Requires initAbr. */
export const readPlane = (...args) => loaded().readPlane(...args);
/** Copies a standalone encoded sample without archive framing. Requires initAbr. */
export const sampleBytes = (...args) => loaded().sampleBytes(...args);
/** Decodes the ordinary mask from a standalone sample payload. Requires initAbr. */
export const readSamplePlane = (...args) => loaded().readSamplePlane(...args);
/** Resolves current primary, dual and texture references by ID or name. Requires initAbr. */
export const resolveResources = (...args) => loaded().resolveResources(...args);
/** Copies a compressed resource without retaining the archive buffer. Requires initAbr. */
export const resourceSource = (...args) => loaded().resourceSource(...args);
/** Normalizes one compressed resource within the decoded-byte budget. Requires initAbr. */
export const decodeResource = (...args) => loaded().decodeResource(...args);
/** Reads a library and prepares shared primary masks within an aggregate budget. Requires initAbr. */
export const readLibrary = (...args) => loaded().readLibrary(...args);
/** Writes an explicit selection, order and folder hierarchy from source documents. Requires initAbr. */
export const composeAbr = (...args) => loaded().composeAbr(...args);
function loaded() {
    if (!runtime)
        throw new Error("Call and await initAbr before using the ABR parser");
    return runtime;
}
let runtime;
let pending;
