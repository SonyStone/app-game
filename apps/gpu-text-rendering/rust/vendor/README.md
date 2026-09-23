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

The compatibility corpus covers `jbig2_file_header`, `jpx_smaskindata`,
`nonisolated_blend_smask`, `knockout_blend_multiply`, and `knockout_smask`.
Generated Rust and browser tests also exercise group flags, opacity, transfer functions
and GDOC reopening without depending on external PDF downloads.

When upgrading Hayro, compare these files with upstream, remove any incorporated patches,
rerun native/WASM tests and both the public compatibility corpus and local book corpus.
Do not edit the global Cargo registry to apply these patches.
