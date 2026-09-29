# Local Hayro patches

These are the crates.io sources for `hayro-interpret 0.7.0` and `hayro-syntax 0.7.2`,
selected through `[patch.crates-io]` in `../document-format/Cargo.toml`.
Upstream: https://github.com/LaurenzV/hayro. Original licenses and bundled font
licenses remain in each crate. The WASM notice generator includes these path dependencies.
Registry bookkeeping files are omitted; upstream source and assets are otherwise retained.

Local changes:

- `hayro-syntax/src/object/stream.rs`: expose partial filter decoding so the converter
  can remove ASCII85/ASCIIHex wrappers while retaining the original JPEG samples.
- `hayro-syntax/src/filter/jbig2.rs`: recognize the JBIG2 file signature and use the
  standalone parser for complete embedded files; retain the embedded/global-segment path.
- `hayro-interpret/src/x_object.rs`: recognize both `SMaskInData` values 1 and 2.
  For associated alpha, undo premultiplication using the image's Matte or default black
  before the app produces premultiplied RGBA. Forward form group isolation and knockout flags.
- `hayro-interpret/src/device.rs`: add a backward-compatible `push_form_group` callback
  with isolation and knockout properties. Devices without an override retain their existing callback.
- `hayro-syntax/src/limits.rs` (new, `pub mod limits`): decode caps shared by both crates —
  `MAX_DECODED_STREAM_BYTES` (256 MiB per filter output) and `MAX_IMAGE_PIXELS` (8192²).
- `hayro-syntax/src/filter/lzw_flate.rs`: Flate (flate2 and fallback), LZW and predictor
  output stop at the stream cap; an oversized zlib result is final instead of retrying the
  raw-deflate/fallback decoders. Predictor row length uses checked arithmetic.
  PNG predictors on rows of whole pixels are unfiltered bytewise instead of through
  `BitChunks` (byte-identical, ~3x faster imports of Flate+Predictor 15 scans); TIFF
  predictors and sub-byte rows with partial pixels keep the generic path.
- `hayro-syntax/src/filter/run_length.rs`: enforce the stream cap.
- `hayro-syntax/src/filter/{dct,jpx,jbig2,ccitt}.rs`: check frame dimensions (and component
  bytes) against the caps after parsing headers, before sample allocation. CCITT also stops
  buffering rows at the stream cap.
- `hayro-interpret/src/x_object.rs`: reject image and mask dictionaries, and decoded frames,
  above `MAX_IMAGE_PIXELS`; the generic `get_components` path (u16 + f32 samples for every
  declared pixel) is limited to `MAX_IMAGE_PIXELS` samples. Failures emit
  `ImageDecodeFailure`.
- `hayro-interpret/src/types.rs`: add `StencilImage::paint()` so a cached stencil can be
  reused without decoding its mask again.

The compatibility corpus covers `jbig2_file_header`, `jpx_smaskindata`,
`nonisolated_blend_smask`, `knockout_blend_multiply`, and `knockout_smask`.
Generated Rust and browser tests also exercise group flags, opacity, transfer functions
and GDOC reopening without depending on external PDF downloads.

When upgrading Hayro, compare these files with upstream, remove any incorporated patches,
rerun native/WASM tests and both the public compatibility corpus and local book corpus.
Do not edit the global Cargo registry to apply these patches.
