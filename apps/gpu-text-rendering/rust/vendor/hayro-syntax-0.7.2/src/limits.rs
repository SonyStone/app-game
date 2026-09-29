//! Local patch: allocation caps applied while decoding untrusted streams and images.
//!
//! See `rust/vendor/README.md` in the GPU text rendering app. These bounds keep a small
//! compressed stream from expanding into an allocation that exceeds 32-bit WASM memory.

/// Maximum number of bytes a single filter may produce, including predictor output.
pub const MAX_DECODED_STREAM_BYTES: usize = 256 * 1024 * 1024;

/// Maximum pixel count of one decoded image frame (8192 x 8192), checked before
/// DCT/JPX/JBIG2/CCITT decoding allocates sample storage.
pub const MAX_IMAGE_PIXELS: u64 = 8192 * 8192;

/// Returns whether `width x height x components` bytes fit both image caps.
pub(crate) fn image_fits(width: u64, height: u64, components: u64) -> bool {
    width
        .checked_mul(height)
        .is_some_and(|pixels| pixels <= MAX_IMAGE_PIXELS)
        && width
            .checked_mul(height)
            .and_then(|pixels| pixels.checked_mul(components.max(1)))
            .is_some_and(|bytes| bytes <= MAX_DECODED_STREAM_BYTES as u64)
}
