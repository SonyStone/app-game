# Ghent 5.0 findings

Run and visual inspection: 2026-09-22. Poppler 26.05.0, PDF.js 6.3.289 and Chromium
148.0.7778.96. Source files came from the user's two extracted Ghent 5.0 archives;
[ghent-manifest.json](ghent-manifest.json) records filenames and SHA-256 hashes.

## Execution

- 50 of 51 individual patches converted, rendered and reopened as GDOC. All 50 reopened
  pages reproduced the initial TypeGPU pixels exactly. No browser console errors occurred.
- `GWG060_Shading_x1a.pdf` stops with `unsupported-pdf` on page 1: mesh shading.
- `Ghent_PDF-Output-Test-V50_ALL_X4.pdf` stops on page 1 for the same reason. Its remaining
  five pages were not rendered by our converter. PDF.js reference captures cover all six.
- Poppler and PDF.js reference images were captured for all 50 accepted individual patches.
  PDF.js also captured the rejected patch and combined document.
- The generic pixel comparison flags all 50 accepted patches. This is not a Ghent verdict;
  it includes text, color-management and antialiasing differences unrelated to some patches'
  specific purpose. No baseline tolerance was relaxed to hide these flags.

## Visual inspection

The inspection uses each patch's printed criteria and the accompanying ReadMes. It covers
static default views at 800 pixels on the longest edge. It does not test interactive layer
switching, ink separations or certification requirements.

| Observation for individual patches               | Count |
| ------------------------------------------------ | ----: |
| Visible failure indicator or missing content     |    29 |
| No obvious failure under the inspected criterion |    19 |
| Further review needed                            |     2 |
| Unsupported                                      |     1 |

The combined document is a second unsupported input, separate from these 51 patches.
[ghent-review.json](ghent-review.json) records every observation and image hash.
"No obvious failure" is deliberately narrower than a PDF/X conformance pass.

### Missing content and layers

`GWG168` and `GWG169` retain only the first effect object; most objects, embedded references,
labels and page framing disappear. `GWG1610` and `GWG1611` retain their main effect row but
lose or nearly erase other content. These are large rendering defects, not color tolerances.
Investigate mask/group scope and composition before attributing the cause.

`GWG152` shows both view labels and a crossed pair of check marks, failing OCMD visibility.
`GWG150` and `GWG151` show the expected single check and Default View. This verifies only
the default state, not support for selecting other configurations.

### Print compositing and color

Overprint indicators fail in `GWG010`, `011`, `020`, `030`, `031`, `040`, `041`, `120`,
`190`, `191` and `192`. `GWG031` resembles its embedded Wrong example, including the
unwanted white rectangle around a shadow. DeviceN patches `080`, `081` and `082` render
their images but lose required check marks; spot ink separations are not preserved by
our screen representation.

Clear filled crosses remain in DeviceCMYK knockout/isolation tests `161` and `162`, in
ICC-RGB `161`, and in ICC-CMYK `164`. The declared CMYK blending space is relevant because
our compositor blends after conversion to RGB. Non-knockout DeviceCMYK `160` has faint
crosses and remains marked for review rather than automatically failing on every outline.

`GWG130` shows green source-profile indicators; `220`, `221` and `230` expose conversion,
output-intent and gray-consistency differences. These require reviewing the complete color
path, including rendering intent, blending space and output intent. A visible indicator
alone does not prove that an ICC profile was never decoded. `GWG132` and `133` show the
expected uniform ICC-based white/green rectangles.

### Images and fonts

`GWG172` has a bright green cross in its ICC-RGB JPEG2000 sample. `GWG173` has a black cross
against a dark-gray square. PDF.js also shows the latter. Distinguish decoding from gray/ICC
conversion before classifying these as codec defects. DeviceCMYK JPEG2000 `170` has no
obvious cross.

The 16-bit portraits in `180`, `181`, `183` and `184` are complete without obvious crosses.
ICC-gray `182` has a faint background cross and needs closer color review. ICC v4 portraits
`205` and `206` are present and not inverted. This does not establish every ICC v4 behavior.

Font substitution/subset checks `050`, `051`, `052`, `090` and `091` show the expected mark
or character sequences at the inspected scale. Basic shadings `061` and image masks `166`
and `167` resemble their embedded references. Fine differences remain in pixel comparison.

## Next implementation order

1. Fix disappearing content in vector/text soft-mask tests and OCMD default visibility.
2. Add mesh shading so the advanced patch and combined document can complete conversion.
3. Preserve the declared blending space through composition; RGB blend support alone is
   insufficient for CMYK transparency tests.
4. Address overprint, DeviceN/spot channels and output-intent-aware color conversion.
5. Recheck JPEG2000/JBIG2 and ICC-gray indicators after isolating their color-conversion paths.

No renderer fixes were made during this discovery run. The run adds repeatable coverage
and records failures. Use [README.md](README.md#local-ghent-50-suite) to reproduce it.
