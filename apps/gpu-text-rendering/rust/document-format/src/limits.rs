/// Encoded input must fit one Vec in 32-bit WASM (its allocation cannot exceed isize::MAX).
/// Decoded geometry, image storage and GPU residency have independent budgets.
/// Keep in sync with src/features/document/limits.ts.
pub(crate) const MAX_FILE_BYTES: usize = 2 * 1024 * 1024 * 1024 - 1;
