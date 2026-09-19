# ABR runtime distribution

Version 1 describes the inputs of our ABR engine. It is not a universal brush format and does not
certify full Photoshop equivalence. Parsing preserves some opaque source records whose drawing
semantics are not understood; the current engine also has documented approximations.

`prepareAbrBrush(source)` is the common conversion used by Paint and the exporter.
`encodeRuntimeBrush(prepared)` writes `.abrbrush`; `decodeRuntimeBrush(bytes)` returns the same prepared
selection with fresh resource IDs. No original ABR file or parser is needed by the receiving widget.

The regression test converts all 465 Megapack presets and compares normalized settings and SHA-256
hashes of every tip/pattern/dual coverage image. This detects conversion losses relative to our existing
engine. It cannot detect a Photoshop feature our engine never implemented.

## Layout

- Bytes 0–7: ASCII `ABRBRUSH`.
- Bytes 8–11: little-endian unsigned JSON byte length.
- UTF-8 JSON: `format: "abr-runtime"`, `version: 1`, ABR engine settings, name, tool defaults,
  and resource entries containing ID, dimensions, format, offset and length.
- Resource payload: tightly packed `r8unorm` coverage images, one byte per pixel. Offsets start at
  the beginning of this payload. No archive paths, code, remote URLs or source binary records.

Limits are 1 MiB JSON, 48 MiB total coverage, three referenced images, 8192 pixels per side and
32 MiB per image. The loader rejects invalid versions, malformed dimensions/references and trailing
or truncated payloads. Bytes are copied on load; IDs change to avoid cache collisions.

The normalized schema is the allowlist. `raw*`, `resourceBlocks`, `sourceSample`, sample dependencies
and full Photoshop descriptors are not serialized. Unknown keys added to form values are stripped by
schema parsing; the loader rejects unrecognized top-level runtime fields. Do not replace this with
`JSON.stringify(sourceBrush)` or the editor's workspace persistence serializer.

Omitted source data is retained only in the author's editor for ABR round-trip/export. That authoring
workflow serves a different audience from the preview widget. Distributing `.abrbrush` avoids delivering
the original ABR but still delivers usable brush settings/images. Extractability of those runtime data
is an accepted product constraint, not a security guarantee.

## Export

ABR Viewer has **Export runtime brush…** for the active preset, including current edits and resolved
saved colors. Existing ABR export remains available for editor users.

For author/server-side conversion from a private file, run from the repository root:

```sh
pnpm exec tsx apps/abr-viewer/scripts/export-runtime-brush.ts \
  --input /private/megapack.abr \
  --brush 'KYLE Ultimate 2B Pencil' \
  --output /output/pencil.abrbrush
```

The command refuses parser errors, ambiguous names and overwriting existing files. Exporting through
the Viewer supports its selected CMYK profile; the CLI uses the engine's existing color conversion.
Keep original ABRs outside a marketplace's public assets. Deliver only selected compiled demo presets.
