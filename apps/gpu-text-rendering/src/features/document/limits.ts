/** Encoded PDF/GDOC input must fit a single Rust Vec in the 32-bit WASM address space.
 * Keep in sync with Rust limits::MAX_FILE_BYTES.
 * Decoded sections, individual images and GPU residency have separate budgets. */
export const maxDocumentFileBytes = 2 * 1024 * 1024 * 1024 - 1;

/** Shared message for local files, transferred buffers and streamed responses. */
export const documentFileLimitMessage = 'Document exceeds the 2 GiB file size limit';
