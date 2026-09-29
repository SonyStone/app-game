/// Encoded input must fit one Vec in 32-bit WASM (its allocation cannot exceed isize::MAX).
/// Decoded geometry, image storage and GPU residency have independent budgets.
/// Keep in sync with src/features/document/limits.ts.
pub(crate) const MAX_FILE_BYTES: usize = 2 * 1024 * 1024 * 1024 - 1;

/// Peak CPU bytes a decoder or importer may hold for its input plus decoded output.
/// 32-bit WASM addresses 4 GiB; the remainder covers code, stacks and bounded temporaries
/// (for example one 256 MiB decoded image). Exceeding it returns `document-limit`.
pub(crate) const MAX_WORKING_BYTES: usize = 3 * 1024 * 1024 * 1024;
