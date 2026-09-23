# GDOC 1.0 — prepared GPU documents

GDOC is the working name of this project's binary document container. It is independent of the source format: a PDF importer, another importer or a native generator can produce the same file. It is not a PDF parser or a general scene description yet.

Version 1.0 implements profile **1: quadratic-atlas glyphs**, profile **2: reusable cubic contours** and profile **3: contours with raster images**.

Profile 1 freezes the existing renderer's prepared glyph representation while replacing the demo's binary-in-BMP transport. The first demo has 1,273 pages and 2,675,369 glyphs. Images, arbitrary path commands, clipping, gradients, transparency groups and embedded fonts are not represented by this profile. The migration tool rejects image-bearing inputs instead of silently dropping them. Profile 2 adds filled outlines and rectangular clipping; profile 3 adds shared raster images, image masks and interleaved vector/image drawing. The remaining operations need further format and renderer work.

The Rust crate at `rust/document-format` owns encoding, validation, decompression and glyph expansion. The same reader is compiled natively and to WASM. `src/features/document/format` only handles transport, WASM ownership and adaptation to the viewer. No GPU resources are allocated by the decoder.

## Container

All header/directory integers are unsigned and little-endian. Offsets are absolute from the start of the file. The maximum file size is 2 GiB minus one byte and the sum of decoded sections is limited to 2 GiB minus one byte. There must be 1–64 sections. All section starts are aligned to eight bytes; sections cannot overlap the directory or each other. The writer zero-fills alignment padding. Readers ignore padding. CRC is IEEE CRC-32 (the algorithm used by `crc32fast`); this detects corruption, not authenticity.

The 32-byte header:

| Offset | Size | Meaning                                         |
| ------ | ---- | ----------------------------------------------- |
| 0      | 8    | Magic: `47 44 4f 43 0d 0a 1a 0a`                |
| 8      | 2    | Major version: 1                                |
| 10     | 2    | Minor version: 0                                |
| 12     | 4    | Profile: 1, 2 or 3                              |
| 16     | 4    | Number of directory entries                     |
| 20     | 4    | CRC-32 of the complete directory bytes          |
| 24     | 4    | Exact file length, including header and padding |
| 28     | 4    | Reserved, must be zero                          |

The directory immediately follows the header. Each entry is 32 bytes:

| Offset | Size | Meaning                                              |
| ------ | ---- | ---------------------------------------------------- |
| 0      | 4    | Unique tag, four uppercase ASCII letters             |
| 4      | 2    | Codec: 0 = raw, 1 = zlib-wrapped DEFLATE             |
| 6      | 2    | Flags: bit 0 = required; all other bits must be zero |
| 8      | 4    | Payload offset                                       |
| 12     | 4    | Stored payload length                                |
| 16     | 4    | Decoded payload length                               |
| 20     | 4    | CRC-32 of decoded payload                            |
| 24     | 8    | Reserved, must be zero                               |

The writer chooses DEFLATE only when smaller than raw bytes. Compression belongs to the container, not the GPU representation. The decoder validates the entire directory and total budgets before decompressing any section. Decompression is capped by each declared decoded length, which must match the result exactly. Raw sections must have equal stored and decoded lengths.

Unknown optional tags are integrity-checked and ignored by the profile reader. Unknown required tags, codecs, profiles and version pairs are rejected explicitly. Minor-version compatibility is deliberately not assumed. Required profile sections must exist regardless of their directory flags. Duplicate tags are invalid.

## Quadratic-atlas profile

This profile requires `PAGE`, `GLYP`, `ATLS` and `PRER`. It contains prepared drawing data; it does not retain editable text, fonts or source-document semantics. On-disk offsets and decoded section buffers never become GPU addresses.

### PAGE

A nonempty array of 24-byte records, at most 100,000 records:

| Offset | Type | Meaning                     |
| ------ | ---- | --------------------------- |
| 0      | f64  | Page width in source units  |
| 8      | f64  | Page height in source units |
| 16     | u32  | First glyph index           |
| 20     | u32  | Glyph count                 |

Dimensions must be finite and in `[0.001, 1,000,000]`. Ranges must be contiguous, start at zero and together cover every GLYP record. Empty pages are allowed. Page positions are chosen by the viewer and are not persisted. The application converts glyph ranges to vertex ranges by multiplying by six.

### GLYP

An array of 20-byte quad instances, at most four million. Integers are little-endian. Positions are absolute, so one record does not depend on preceding records.

| Offset | Type    | Meaning                                  |
| ------ | ------- | ---------------------------------------- |
| 0      | i16 × 2 | Base corner x/y                          |
| 4      | u16 × 2 | Curve metadata origin x/y in ATLS texels |
| 8      | i16 × 2 | First edge vector                        |
| 12     | i16 × 2 | Second edge vector                       |
| 16     | u8 × 4  | RGBA color                               |

These are the prepared, expanded glyph quads expected by the existing coverage shader. Positions map through `snorm16x2`; before page/camera projection, x becomes `x + 0.5` and y becomes `0.5 - y`. The first page's dimensions define the document's normalized axes. Glyph quads and the curve/raster metadata must be prepared together; this profile does not infer their bounds from font data.

Rust expands each instance into corners `0, 1, 2, 3, 2, 1`, using wrapping i16 addition for the edge vectors. Each GPU vertex is 12 bytes: `snorm16x2 position`, `uint16x2 curves`, `unorm8x4 color`. Curve coordinates become `2*x + cornerX` and `2*y + cornerY`; the low bits select the quad corner. The decoder validates curve origins against the atlas before expansion.

Glyph-center arrays used by the camera tour are derived using double arithmetic, followed by conversion to f32, matching the previous JavaScript implementation. They are not stored in the file. No renderer-specific alignment padding is part of GLYP.

### ATLS

Two little-endian u32 dimensions, followed by exactly `width * height * 4` bytes of RGBA8 curve metadata. Each dimension is in `[1, 16,384]`. Payload texels retain the renderer's existing quadratic-atlas encoding; they are not an image color space and must not be color-corrected, premultiplied or flipped.

Each referenced glyph header starts with three adjacent texels: grid origin, small-text raster origin, and four u8 sizes (`gridWidth`, `gridHeight`, `rasterWidth`, `rasterHeight`). Coordinate-pair texels pack two **big-endian** u16 values into RG and BA. Remaining texels contain the cell index tables and normalized quadratic curve points used by `rendering/glyphShader.ts`. This atlas encoding is specific to profile 1; the container itself has no texture/channel assumptions.

### PRER

Two little-endian u32 dimensions of the generated coverage texture, each in `[1, 16,384]`, followed by prepared 12-byte GPU vertices. The payload must be a multiple of 72 bytes (six vertices per quad); curve coordinates already include their corner bits. Curve origins are checked against ATLS. The dimensions describe the render target, not the vertex data's byte length.

The renderer creates this texture and its mipmaps at runtime. Pixels of the coverage texture are not stored in the file, preserving the previous rendering algorithm and quality.

## Cubic-contour profile (2)

Requires `PAGE`, `CURV` and `DRAW`. This is prepared vector artwork, independent of PDF, fonts or text semantics. It preserves cubic curves as float32 control points; it does not triangulate or rasterize pages. Filled text and arbitrary filled paths use the same representation.

`PAGE` uses the same 24-byte width/height/first/count records as profile 1, but its ranges address **drawing instances**, not glyphs. At most 10,000 pages and 1,500,000 instances are accepted. Ranges must cover DRAW contiguously; empty pages are valid. Viewer page placement accounts for mixed page sizes and is not stored.

### CURV

At most 2,000,000 32-byte records: four little-endian `vec2<f32>` control points `p0, p1, p2, p3` per cubic. A writer normalizes a closed outline's bounds to `[0,1]²`, closes its subpaths, converts lines/quadratics to equivalent cubics and splits at both x and y extrema. Segments of an outline are contiguous. Distinct instances can reference the same range.

Endpoints must be within `[-0.00001,1.00001]`; control points must be finite within `[-4,4]`. Controls may extend beyond the curve's unit bounds. The derivative quadratic is checked for monotonicity along both axes, with a `1e-6` rounding tolerance. This is what makes the shader's bounded intersection search unambiguous.

### DRAW

Each instance is 80 bytes, matching the TypeGPU storage schema:

| Offset | Type    | Meaning                                                                 |
| ------ | ------- | ----------------------------------------------------------------------- |
| 0      | f32 × 4 | Affine `a,b,c,d`: `x'=a*x+c*y+tx`, `y'=b*x+d*y+ty`                      |
| 16     | f32 × 2 | Translation `tx,ty`                                                     |
| 24     | u32 × 2 | Clip-chain reference and curve-bin offset, both zero without extensions |
| 32     | f32 × 4 | Straight RGBA, components in `[0,1]`                                    |
| 48     | f32 × 4 | Rectangular clip `minX,minY,maxX,maxY` in page coordinates              |
| 64     | u32     | First CURV index                                                        |
| 68     | u32     | Segment count, 1–65,536                                                 |
| 72     | u32     | Fill rule: 0 nonzero, 1 even-odd                                        |
| 76     | u32     | Page index, matching its PAGE range                                     |

The affine maps unit outline coordinates into normalized, top-down page coordinates. All pages use the **first page's** width/height as normalization factors. The viewer flips y for projection, then applies page placement and the camera. Matrices must be nonsingular; floats must be finite with absolute value at most `1e9`. Clip bounds must be ordered. Draw order is source paint order within a page; normal premultiplied-alpha compositing is used after multiplying the stored straight RGB by its alpha in the fragment shader.

The renderer draws an instanced quad for each outline and evaluates winding on monotone cubics. It estimates edge coverage from screen derivatives and curve intersections; antialiasing is approximate, not an exact area integral. Frequently reused outlines also use bounded summed-area coverage tables; the original curves remain the magnified fallback. Small outlines scan their segments directly; larger outlines use the required BINS extension below. It is not yet expected to match the large demo's throughput for arbitrary PDFs. Geometry is retained across zoom changes.

## Required rendering extensions

The container version and profile remain unchanged. A writer marks each extension **required**, so older readers reject the file instead of silently ignoring clipping, acceleration or compositing. Readers still accept older profile 2/3 files with zero DRAW padding and no extension sections.

### CLIP

DRAW offset 24 is a one-based clip-node index, or zero for no analytic clip. `CLIP` uses the same 80-byte storage layout, but its affine maps normalized page coordinates **into** the clip outline's unit square. Its range/fill fields address CURV; the last u32 is the parent clip reference instead of a page number. The color and rectangular fields are placeholders. The node's own offset 24 must be zero; offset 28 can refer to BINS. Parents must precede their children. Depth is limited to 32, and at most 1,000,000 nodes are accepted.

The shader evaluates the intersection of all clip contours on the original curves. Both fill rules, nested clips and clip-stack restoration apply to text, paths and images. Screen derivatives are taken before walking the chain. Rectangular clips remain in DRAW's fast bounds field. Clip edge coverage is approximate, like outline edge coverage.

### BINS

DRAW/CLIP offset 28 is a u32 offset into `BINS`, or zero for a direct segment scan. BINS is a little-endian u32 array, limited to 32 MiB. Each table contains 128 horizontal bins followed by 128 vertical bins; every bin is a `(start, count)` pair addressing an ascending list of absolute CURV indices in the same array. A curve is included in every bin touched by its monotone endpoint interval. Tables are shared by all instances of the same outline. The writer reserves the budget for the largest outlines first. When optional tables do not fit, outlines with at most 4,096 segments keep offset zero and use an exact direct scan; larger outlines still require a table.

Writers generate tables for outlines above 64 segments. Readers require them above 4,096 segments and permit at most 65,536 segments per outline. Offsets/counts and every curve index are validated before upload. The shader visits the horizontal and vertical bins at the fragment's local coordinates; this retains winding and curve-based antialiasing without scanning the entire large path.

### BLND

Optional only when every draw uses normal blending. When present, this required section has one byte per DRAW: 0 Normal, 1 Multiply, or an extended blend code enabled by BLNX below. Unknown values and length mismatches are invalid. Multiply composites each draw in paint order using premultiplied source S and destination D: `S.rgb * D.rgb + S.rgb * (1 - D.a) + D.rgb * (1 - S.a)`. Alpha is `S.a + D.a * (1 - S.a)`. This also works inside transparent isolated groups.

### GRUP

Required when present. Each 24-byte record contains six little-endian fields: first DRAW (u32), exclusive end DRAW (u32), opacity (f32 in [0,1]), blend and properties (u32), parent (u32: zero for page root, otherwise one-based preceding record), page index (u32). The base blend codes are 0 Normal and 1 Multiply; MASK, BLNX and GFLG enable additional kinds and properties. Records are in preorder and nondecreasing first-DRAW order. Siblings cannot overlap; children must fit their parent and page. Empty groups are allowed. Limits: 100,000 groups and 32 levels.

Groups default to initially transparent viewport-sized targets. GFLG can select an inherited backdrop or knockout behavior. Group opacity applies once to the completed group, then its blend combines it with the parent. Normal/opaque groups may be flattened only when that preserves isolation and knockout behavior. Targets are reused by nesting depth and recreated on viewport resize. Scene layers keep their shared pass; document offscreen commands submit before that pass is submitted. White page paper is drawn beneath the completed page content and does not participate in its blend functions.

### HAIR

Required four-byte little-endian version `1`. Enables DRAW kinds 3/4/5: one-device-pixel centerline strokes with butt/round/square caps. CURV retains cubic centerlines; their bounds include a small normalization margin, not a geometric stroke width. Dashes are split in source coordinates. Fragment coverage measures curve distance in framebuffer pixels, so zoom does not change line width. Nearest-curve evaluation and edge coverage are approximate. Older readers reject the required extension.

### MASK

Required four-byte version `1`. GRUP kinds 2/3 denote an Alpha/Luminosity mask, respectively. A mask must be the first child of a paint group, never a page root or a direct child of another mask. Its opacity field stores the luminosity background in [0,1]. Its drawing interval is hidden mask content. The renderer paints the mask separately and multiplies the source group by its alpha or by `dot(premultipliedRGB, [0.3, 0.59, 0.11]) + background * (1-alpha)` before compositing the group. Graphics-state masks wrap individual draws; group masks apply to the completed group once. An optional required `MTRF` table supplies the transfer function applied after this mask value is computed, including outside the mask bounds.

## Contours with raster images (3)

Requires `PAGE`, `CURV`, `DRAW`, `IMAG` and `PIXL`. Geometry and page tables retain profile 2's layout and limits. `DRAW` remains one ordered stream: kind (offset 72) is 0/1 for an outline fill or **2 for an image**. For an image, offset 64 is the IMAG index, offset 68 must be zero, and the affine maps the top-down unit image square to page coordinates. The straight RGBA color is a tint and opacity multiplier (white for ordinary images, the PDF paint for stencils). Clipping and page ownership apply equally to images and outlines. Adjacent compatible draws can be batched; images must not be moved before or after overlapping outlines.

### IMAG and PIXL

`IMAG` contains at most 10,000 records of 24 bytes:

| Offset | Type | Meaning                                                          |
| ------ | ---- | ---------------------------------------------------------------- |
| 0      | u32  | Width in pixels, 1–65,535                                        |
| 4      | u32  | Height in pixels, 1–65,535                                       |
| 8      | u32  | Byte offset into PIXL                                            |
| 12     | u32  | Stored byte length                                               |
| 16     | u32  | Image interpolation: 0 nearest, 1 linear                         |
| 20     | u32  | Codec: 0 raw RGBA, 1 zlib RGBA, 2 JPEG, 3 ICC JPEG, 4 tiled mips |

Ranges must cover `PIXL` contiguously. The encoded payload is limited to **1536 MiB**; each individual decoded image is also limited to 256 MiB. Container limits are 2 GiB minus one byte on disk and across decoded sections. Packed image bytes remain packed when crossing the document decoder boundary.

Codec 0 stores top-down premultiplied RGBA8; codec 1 stores exactly those bytes as an independent zlib stream. Every decoded RGB component must be at most alpha. Rust validates each compressed resource independently, with its declared expansion limit. Codec 2 stores an RGB/gray JPEG; codec 3 stores a JPEG with the PDF color profile in APP2 records. Both have matching validated dimensions; decoding is validated before upload. Codec 4 stores the tiled pyramid described below. Nonzero codecs require an `IPCK` section marked required, containing little-endian u32 version `1`. Old profile-3 files without IPCK remain readable.

The PDF converter retains JPEG entropy data for RGB/gray/CMYK or ICC images without PDF masks, Decode mappings or decode parameters. It removes source EXIF/ICC metadata; codec 3 then embeds the PDF ICC profile, or the same CC0 CGATS CMYK profile used by Hayro for DeviceCMYK. Four-component CMYK/YCCK JPEGs decode in Rust/WASM with PDF DCTDecode component polarity, followed by the embedded ICC-to-sRGB transform. Standalone browser JPEG decoding can invert those PDF samples, so it is used only for one- and three-component JPEGs; browser color conversion applies only for codec 3. Existing retained-JPEG GDOC files use the same corrected decoding path without migration. Other resources use Hayro color/mask conversion and lossless RGBA packing; no lossy recompression is introduced. Stencils store premultiplied white with per-draw paint.

A document-owned worker expands one requested image at a time. The GPU cache has a **96 MiB texture budget including mipmaps**. Visible instances select resolution from projected size; the full source resolution remains available for zoom. If an overview's working set exceeds the budget, its selected levels are reduced together. Invisible images are evicted, stale camera requests are discarded, and successful uploads invalidate the Solid frame loop. Nearest/linear filtering follows the interpolation flag. Idle workers terminate; replacing the document or losing its device releases pending work and textures. No page raster fallback is used.

## PDF conversion

`pdf::convert` uses [hayro-interpret 0.7.0](https://docs.rs/hayro-interpret/0.7.0/hayro_interpret/trait.Device.html) as a drawing interpreter and writes profile 2 for vector-only documents or profile 3 when images are present. It supports filled/stroked outline glyphs and paths, nonzero/even-odd fills, solid colors with alpha, rectangular and analytic contour clipping, crop boxes and page rotation. Kurbo expands positive-width strokes into cubic fill outlines with PDF joins, caps, miter limits and dash patterns before applying the affine. Offset-curve approximation tolerance is at most 0.001 source unit and 0.0001 of stroke width. Closed-path holes are retained. Disconnected, non-overlapping fill components can be drawn separately; overlapping or nested bounds remain together. Non-overlapping tiling-pattern cells are interpreted through the same vector/image path under the painted shape’s clip, with a 65,536-cell and 16-level nesting limit. Type 3 glyph programs run through the same drawing Device, with state restored after each glyph. Axial gradients use a 4096-sample premultiplied color lookup stretched along the gradient axis and clipped by the original vector path; color functions and transfer functions are sampled in their source color space. Color interpolation is approximate, while clipping curves remain analytic. Embedded fonts and the interpreter's bundled Standard 14 substitutes are supported; other font fallback is rejected. Glyph outlines are cached by the interpreter's font/glyph key across pages. Inline and XObject images use Hayro's image decoders, including JPEG/JPX, grayscale/RGB/CMYK and indexed/ICC color conversion. Image soft masks, explicit masks, color-key masks, solid-painted stencils and constant image opacity are represented. Reused XObjects share a pixel resource; masks with a different resolution are sampled in image coordinates.

Tiling patterns with blend modes produce `unsupported-pdf` with a one-based page number. Axial/radial gradients, sampled function shadings, overlapping pattern cells, soft-mask transfer functions and all 16 RGB blend modes are supported. The local interpreter patches expose form group isolation and knockout properties. Required BLNX/GFLG/MTRF/RGRD extensions preserve these features on reopening; their records and approximation limits are documented below. The import is discarded on failure. Encrypted/password-protected or unparseable input returns `invalid-data`. This is an initial subset, **not a general PDF fidelity guarantee**: it also inherits Hayro's parser/interpreter limitations and warning coverage. Annotation appearances, forms, interactive content and text selection are not implemented.

The input PDF is limited to 2 GiB minus one byte, 10,000 pages and the output profile's geometry budgets. Conversion runs in a separate module Worker with its own WASM build (about 4.13 MB before compression, including font support). The regular GDOC decoder remains about 587 KB and does not depend on the PDF interpreter. Both are loaded by Vite-managed asset URLs. Files stay local; conversion never sends the document to a server.

The viewer sniffs the input bytes and imports PDF directly into validated render buffers. The same section-level geometry, image, group and budget checks serve direct import and GDOC decoding. GDOC serialization is deferred until Download GDOC; that export reinterprets the original local File in a disposable Worker, so it adds work only when requested. Selecting another document disposes the old session and cancels outstanding work. Source parsing and conversion are currently whole-document operations; Worker termination bounds their lifetime, not their peak memory. The loader also builds coverage tables and boundary grids in its Worker before transferring render data. Image decoding/upload and composed page caches prioritize the initial visible pages; incremental PDF source parsing remains future work.

## Browser lifetime and errors

`readGdoc(urlOrBuffer, signal)` creates one module Worker for one document. A supplied ArrayBuffer is consumed by transfer; callers must clone it themselves if they need to retain it. URL reads enforce the 2 GiB minus one byte budget while streaming, including responses without Content-Length. Rust validates the same file-size budget before parsing. Cancelling the signal terminates the Worker, stopping fetch and synchronous WASM work. PDF conversion and GDOC decoding have no wall-clock deadline: processing time depends on the device and document. Choosing another document, returning to the demo or unmounting the viewer cancels the session and terminates its Worker. Allocation and format budgets remain enforced.

WASM returns a `DecodeOutcome` object: either a document or a stable error code/message. Expected format failures never throw JavaScript exceptions. The adapter uses `neverthrow` at browser/WASM exception boundaries. Error codes are `invalid-data`, `unsupported-format`, `document-limit`, `checksum` and `decode`; transport additionally uses `http` and `load`. Cancellation is the existing distinct `aborted` result.

The generated Vec getters copy data out of WASM memory. The browser adapter packs quadratic glyph vertices losslessly into 28-byte instances before transfer; the WASM API and GDOC bytes remain unchanged. Owned buffers are transferred to the main thread without structured-clone copies. The Worker is terminated on success, cancellation and failure, releasing its retained WASM heap. Peak CPU memory still includes compressed input, decoded sections, expanded vertices and WASM-to-JS copies. Source interpretation and geometry upload still process the whole document; image and composed-tile residency is demand-driven. The default full demo uses about 77.0 MiB of explicit GPU resources.

## Build and reproduce

Generated WASM/glue, third-party notices and `demo.gdoc` are checked in so normal Vite builds require only Node/pnpm. The build refreshes the notices from locked Cargo sources, including embedded font licenses; the viewer links to the bundled text. Source changes to Rust require the pinned Rust 1.92.0 toolchain and the matching wasm-bindgen generator:

```sh
rustup toolchain install 1.92.0 --profile minimal --component clippy,rustfmt --target wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
pnpm --filter @app-game/gpu-text-rendering build:wasm
pnpm --filter @app-game/gpu-text-rendering migrate:demo
pnpm --filter @app-game/gpu-text-rendering test:rust
pnpm --filter @app-game/gpu-text-rendering test:wasm
```

`tools/legacy-demo` contains the unchanged source fixture for reproducible migration. It is never fetched by the viewer or included in a production bundle. `migrate-demo` is a native Rust CLI and deliberately knows about the old 54-byte BMP wrappers and delta positions. The reusable container/profile reader knows neither BMP nor PDF; PDF interpretation is an optional `pdf` Cargo feature.

`tests/fixtures/demo-digests.json` records SHA-256 hashes from the original TypeScript decoder before migration. `test:wasm` checks every expanded vertex byte, both glyph-center arrays and both atlases against those hashes. Native tests exercise roundtrips, truncation, mutations, version/profile handling, optional sections, malformed directory entries, checksums, decompression budgets, ranges and references. Browser checks exercise the actual module Worker, transfers, cancellation, errors and main-thread responsiveness. The seven rendering snapshots matched the pre-migration captures with zero pixel differences on the local Apple Metal adapter.

PDF browser checks additionally cover cap/join/dash pixels, nested clipping and restore, Multiply, tiling patterns and a 5,000-segment binned contour. PDF browser checks cover real Worker/WASM conversion, embedded and Standard 14 fonts, cubic fill/holes/clip pixels, rotation, empty pages, download/reopen, unsupported graphics and cancellation. Broader PDF drawing support and performance optimizations remain separate stages.

### VTEX: independently encoded raster mip pyramids

Codec 4 additionally requires a `VTEX` section marked required, containing little-endian u32 version `1`. Older readers reject this extension explicitly. Existing codecs 0–3 remain supported by the same virtual-texture renderer.

The IMAG width and height describe the source image. Its PIXL range contains:

| Offset | Type           | Meaning                                                                 |
| ------ | -------------- | ----------------------------------------------------------------------- |
| 0      | u32            | Tile interior size, exactly 128                                         |
| 4      | u32            | Complete mip count, floor(log2(max(width, height))) + 1                 |
| 8      | u32            | Total tile count over all levels                                        |
| 12     | u32            | Reserved, zero                                                          |
| 16     | 8-byte records | Byte offset relative to this image payload, then compressed byte length |

Tile records follow level order from full resolution to 1×1, then row-major tile order within each level. Mip dimensions are max(1, floor(source dimension / 2^level)). Tiles cover each mip exactly; edge interiors may be smaller than 128. Every tile contains one extra neighboring texel on all four sides, including corners. Borders clamp only at the edge of the image. Its independent zlib stream expands to exactly `(interiorWidth + 2) × (interiorHeight + 2) × 4` premultiplied RGBA8 bytes. Byte ranges start immediately after the directory, are contiguous and exhaust the image payload.

Rust validates the entire directory and each tile's bounded expansion and premultiplication before transferring data to workers. The encoder preserves full-resolution pixels exactly and uses area averaging for smaller levels, including odd dimensions. Tile payloads share the 1536 MiB aggregate encoded-resource limit; each original image retains its existing decoded-size limit.

PDF conversion chooses codec 4 for decoded resources above 256 KiB when the lossless pyramid is no larger than twice the previous packed representation, with a 16 KiB minimum allowance, and fits the remaining resource budget. Smaller resources retain their compact representation; JPEG entropy data stays unchanged. This storage choice does not change rendering: every image has LOD and uses the shared virtual-texture cache. Whole-image codecs build requested tiles in a worker; codec 4 inflates only requested tiles. No full-page raster fallback or lossy JPEG recompression is introduced.

The renderer packs the complete small-mip tail for every image before the first document frame into a document-owned atlas. The maximum tail resolution adapts to the number and dimensions of images so this atlas stays within 16 MiB. Detail resides in up to 961 reusable 130×130 slots, below 64 MiB, with a 128 KiB GPU indirection table. Small images need no detail slot when their full mip chain fits the tail. Tails stay resident until document disposal; detail eviction never removes the fallback. Resource budgets exclude vector buffers and transparency-group render targets.

## Additional compositing extensions

### BLNX

Required u32 version `1` for extended blend modes. BLND and the low byte of GRUP's
blend field use 0 Normal, 1 Multiply, 4 Screen, 5 Overlay, 6 Darken, 7 Lighten,
8 ColorDodge, 9 ColorBurn, 10 HardLight, 11 SoftLight, 12 Difference, 13 Exclusion,
14 Hue, 15 Saturation, 16 Color, 17 Luminosity. GRUP values 2/3 remain masks and
are invalid in BLND. Blend functions operate on straight RGB; the compositor then
combines premultiplied source and backdrop with their alpha values.

### GFLG

Required u32 version `1` when GRUP's blend field has property bits. The low byte is
the blend mode, bit 8 means non-isolated and bit 9 means knockout. Remaining bits
must be zero. Mask records cannot have these flags. Older files retain isolated,
non-knockout behavior. Non-isolated groups inherit the parent backdrop; its
contribution is removed before group opacity/masks apply. Knockout groups replace
previous siblings under the new object's shape, independently of its opacity.
The renderer uses viewport-sized intermediate targets, never whole-page rasterization.

### MTRF

Required when present. Each 1028-byte record contains a mask group index as u32 and
256 little-endian f32 samples for inputs `i / 255`. Indices must be distinct and
refer to GRUP kind 2/3. Samples must be finite and in [0,1]. Missing tables mean
identity. The GPU linearly interpolates samples after extracting alpha/luminosity.
This is a sampled representation, not an exact encoding of arbitrary discontinuous functions.

### RGRD

Required when present. Contains one 64-byte record per IMAG, with four vec4f fields:

- bounds: normalized shading-space width and height, then two reserved zeros;
- start: first circle center x/y, radius, radius delta;
- change: center delta x/y, flags, reserved zero;
- background: premultiplied RGBA outside the radial domain.

A flags value of zero selects ordinary image sampling. Radial flags are 1 plus
2 for Extend[0] and 4 for Extend[1]. The radial image is a 4096×1 sampled color ramp.
Circle coordinates are relative to the drawing rectangle and divided by its longest
side. The GPU solves the circle equation per pixel, chooses the largest valid parameter
with nonnegative radius, and samples the ramp. Geometry is analytic at every zoom;
colors retain the precision of the stored ramp.

Function-based shadings use 512×512 sampled color tables with analytic outer clipping,
stored as ordinary tiled image resources. Fine discontinuities in arbitrary functions
can be softened at magnification. Very wide JPEGs use Rust decoding and lossless image
tiles rather than a browser canvas; the 256 MiB decoded-image limit still applies.

### Mesh shading import

PDF shading types 4–7 are sampled into a separate tiled image in page space at up to 4 pixels per point, capped at 4096 pixels on the longer side. Patch geometry is subdivided to a quarter output pixel where possible, with a bounded 256-cell grid. Colors are interpolated in the PDF color space before its function, transfer and opacity are applied. Four coverage samples share edges without accumulating alpha. The original clip chain, surrounding text and paths remain vector. This is finite-resolution gradient support, not a resolution-independent mesh representation.

The importer consumes its input buffer and releases PDF/parser state before encoding. Image payloads are moved into the GDOC writer and stored without redundant outer compression; readers continue to support compressed PIXL sections. WASM allocations and per-image/GPU budgets remain separate from the input file-size allowance.
