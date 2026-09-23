# PDF compatibility findings

Reviewed after the compatibility fixes on 2026-09-22. Sources and hashes are in
[manifest.json](manifest.json), pinned to PDF.js fixture revision
`d54c193bd4dd6c34759cb88f1a3b78db66f0962c`. References are Poppler 26.05 and
PDF.js 6.3.289, rendered independently from our Rust/WASM converter.

All 44 selected PDFs now convert and render. Previously 33 opened, nine stopped on
unsupported graphics, one exceeded the image dimension limit, and one failed JBIG2 decoding.
All 70 selected pages reproduce their initial TypeGPU pixels exactly after downloading
and reopening GDOC. The previous run covered 54 rendered pages.

| Current result              | Documents | Meaning                                                    |
| --------------------------- | --------: | ---------------------------------------------------------- |
| Within comparison tolerance |        15 | Meets the current image screening thresholds               |
| Visual difference           |        29 | Requires review; includes color, text and edge differences |
| Conversion/render failure   |         0 | All selected documents open                                |

The original ten local books also converted, rendered and reopened as GDOC without browser
errors. The seven legacy demo views remain pixel-identical to the pre-GDOC baseline.
These checks establish execution and round-trip behavior, not complete PDF conformance.

## Fixes exercised by this corpus

- Transparency groups retain isolation and knockout properties. Non-isolated groups
  inherit their backdrop; group opacity applies once. Knockout uses object shape
  independently of opacity. The previously missing word in `nonisolated_blend_smask`
  and incorrect overlap colors in the two knockout fixtures are fixed.
- All 16 PDF blend modes have RGB implementations. The page starts with transparent
  content; white paper is placed beneath the completed result. This prevents Difference
  from blending the first object against a white backdrop in `transparency_group`.
- Soft-mask transfer functions apply after alpha/luminosity extraction, including outside
  mask bounds. GDOC retains the sampled transfer table.
- JPEG 2000 associated alpha is unpremultiplied with its Matte before conversion to our
  premultiplied image representation. `jpx_smaskindata` now agrees with modern PDF.js.
- Complete embedded JBIG2 files use the standalone decoder. Embedded streams with global
  segments retain their original decoding path. `jbig2_file_header` now displays its image.
- Radial shadings retain circle geometry and extension flags. TypeGPU solves the circle
  equation per pixel and samples a color ramp. Function-based shadings use sampled color
  tables. Overlapping tiling-pattern cells no longer fail conversion.
- The 40,000-pixel-wide JPEG uses Rust decoding and lossless virtual-texture tiles,
  avoiding browser canvas dimension limits. The decoded-image memory limit remains 128 MiB.
- Curve antialiasing no longer extends distant tangent lines across an outline's bounds.
  A generated browser test checks the blank area outside a stroked ellipse.

Generated native and browser tests cover extension validation, group isolation and opacity,
knockout shape, mask transfer outside bounds, page background composition and GDOC reopening.
The external PDF corpus adds combinations not present in those small fixtures.

## Reference corrections

The initial report treated Poppler as the only reference and attributed some differences
to our renderer too early. Both reference images and their versions are now retained.
Seven manifest entries explicitly choose PDF.js as their primary comparison and record why.

- Alpha masks ignore BC. The initial claim that `smask_alpha_bc` lost a required blue
  backdrop was incorrect; the current result agrees with PDF.js 6.3.
- Poppler drops the complete embedded JBIG2 image and reports PostScript type errors in
  the function-shading checkerboard. PDF.js displays both.
- Poppler differs on associated JPEG 2000 alpha and on soft-mask background transfer.
- CalRGB conversion agrees with the PDF.js transform. Its remaining flags are concentrated
  around text and edges; the earlier claim of a proven CalRGB conversion defect is withdrawn.
- The orange image-mask sample in `images_1bit_grayscale` is present. Its appearance is much
  closer to PDF.js than Poppler. The case remains flagged against Poppler.
- `Type3WordSpacing` still differs, but a spacing defect has not been established. Stroke,
  inherited color and text-edge differences need separate investigation.

Choosing a different reference does not suppress its alternative image. The report shows
Poppler, PDF.js, TypeGPU and the difference image together. A reference/version change
requires explicit baseline review.

## Remaining differences and limits

`devicen-none-zero-domain` has the largest remaining difference. Its sampled tint
function contains a zero-width domain for one component. Hayro's interpolation/clamping
selects finite samples where both references produce black. This malformed-function
recovery behavior remains unresolved and is explicit in the baseline.

`function_based_shading_cmyk` still has visible color differences. Function tables are
sampled at 512×512; arbitrary discontinuities can soften at magnification. Radial geometry
is analytic, but its color ramp has 4,096 samples and its domain edges still differ from
reference antialiasing. Text-heavy pages, Type 3 glyphs, patterns and image filtering also
produce flags. A flagged page is not automatically a confirmed missing-feature defect.

The compositor currently blends in RGB. The corpus does not establish arbitrary blending
color-space equivalence, overprint/print behavior or every interaction of masks and groups.
Mesh shadings and tiling patterns with blend modes remain unsupported. These fixtures do
not justify a claim that every PDF is supported.

Ghent 5.0 was unavailable during this PDF.js run. The user subsequently supplied the files;
its separate results are in [ghent-findings.md](ghent-findings.md). Cal Poly remains untested
after its download returned HTTP 403. The complete PDF.js issue corpus was not downloaded.

## Reproduction

Use [README.md](README.md). The generated `index.html` contains page images and metrics;
`report.json` records execution, reference warnings and exact GDOC round trips.
[baseline.json](baseline.json) retains known visual differences and fails on new errors,
missing pages, broken round trips or increased image error. Do not interpret an unchanged
baseline as a pass for full PDF support.
