# PDF rendering compatibility

This corpus tests visual fidelity separately from successful conversion. It currently pins
44 PDF.js documents by commit and SHA-256. Original PDFs, generated GDOC files and images
stay in an external directory; they are not redistributed with this repository.

See [findings.md](findings.md) for reviewed findings and [manifest.json](manifest.json) for
sources, selected pages and unavailable suites. An unchanged baseline means no new
regression in this selection. It does **not** mean all documents render correctly.

## Run

Requires the standalone development server on port 3180, Playwright Chromium with WebGPU,
Poppler (`pdftoppm`), and Python with Pillow and NumPy. Use `PYTHON` to select that interpreter.
On macOS, a bundled Poppler may need `FONTCONFIG_FILE` pointing to an existing fonts.conf.
The reviewed run used `/opt/homebrew/etc/fonts/fonts.conf`.

```sh
pnpm --filter @app-game/gpu-text-rendering dev
```

In another terminal:

```sh
pnpm --filter @app-game/gpu-text-rendering fetch:compatibility /absolute/path/to/pdf-rendering-tests
pnpm --filter @app-game/gpu-text-rendering test:compatibility /absolute/path/to/pdf-rendering-tests
```

The second command renders the corpus, generates `results/index.html` with side-by-side
Poppler/PDF.js/TypeGPU/difference images, and checks [baseline.json](baseline.json). Existing
unsupported features, limits and visual differences remain visible in its output.
New error categories, missing cases/pages, broken GDOC round trips and increased image
error fail the check. Status improvements require baseline review too.

`GPU_TEXT_URL` overrides the standalone server URL. `GPU_TEXT_OUTPUT` overrides the
results directory. `GPU_TEXT_CASE` filters IDs for diagnosis, but a filtered run cannot
pass the complete baseline check. Run a discovery without checking the baseline:

```sh
node tests/compatibility/run.browser.mjs /absolute/path/to/pdf-rendering-tests
node tests/compatibility/pdfjs-reference.mjs /absolute/path/to/pdf-rendering-tests
python3 tests/compatibility/compare.py /absolute/path/to/pdf-rendering-tests/results
```

After inspecting changes, update the baseline explicitly:

```sh
python3 tests/compatibility/compare.py /absolute/path/to/pdf-rendering-tests/results --write-baseline tests/compatibility/baseline.json
```

Comparison self-checks:

```sh
python3 -m unittest discover -s tests/compatibility -p 'test_*.py'
```

## Coverage and comparison contract

- All pages of each selected document are tested except `tracemonkey.pdf`, which samples
  pages 1–3. The report records actual page coverage for every run.
- Each PDF runs through the actual Worker/WASM converter, GDOC decoder and TypeGPU renderer.
  Every view waits for virtual-texture refinement, so these are settled-image fidelity tests.
  Initial LOD and interaction behavior remain covered by the existing browser tests.
- Selected pages are rendered at a longest edge of 800 physical pixels, DPR 1, respecting
  CropBox and rotation. Poppler uses the same output size; its scaling accounts for rotation.
- The GDOC download is saved to disk, read back through the decoder, and rendered with fresh
  GPU resources. Its pixels must match the initial render exactly.
- Raw pixel error is reported alongside symmetric nearest-neighbor error within one pixel.
  The latter reduces antialiasing noise without accepting missing content on a white page.
  Channels differing by more than 24 count as changed. Screening tolerances are 0.5% of the
  page, 3% of foreground pixels, and mean error 2 after a 0.7-pixel Gaussian blur.
- A `within-tolerance` result is not proof of conformance. Poppler's default display color
  management is an independent reference, not an absolute oracle; color-intent and font
  substitution differences require review. Other zooms, browsers and PDF combinations need
  additional tests. The report records renderer versions and every reference warning.
- Each TypeGPU browser operation has a deadline. An overdue page closes along with its workers,
  allowing later inputs to run. Poppler also has a per-page deadline.

## Sources not yet available

Ghent 5.0 is now available from user-supplied archives and has a separate manifest,
baseline and visual review. See [ghent-findings.md](ghent-findings.md) and the commands below.

The selected Cal Poly Cerebellum 10/1000 downloads returned HTTP 403 in the local downloader.
An in-app browser PDF tab did not expose a downloadable local file. No Cal Poly performance
or fidelity results are claimed. Its originals must remain outside the repository because
the publisher restricts redistribution and alteration. See the
[official source and conditions](https://pdfa.org/resource/cal-poly-pdfvt-test-suite/).

## Choosing references

The test-only `pdfjs-dist` dependency is pinned to 6.3.289. It runs independently
through Canvas2D and its own parser/worker, not through our converter. The report
shows both references; seven manifest entries explicitly select PDF.js because Poppler
differs on CalRGB, associated JPEG 2000 alpha, soft-mask backgrounds and transfer
functions, a standalone JBIG2 stream, or a PostScript color function. Each override
includes its reason. Changing the primary reference or PDF.js
version requires baseline review. Poppler warnings are retained with bounded log size.

Successful conversion and exact GDOC reopening do not imply visual agreement. Keep
visible differences in the baseline even when the file opens.

## Local Ghent 5.0 suite

[ghent-manifest.json](ghent-manifest.json) pins 51 individual patches and the combined
six-page PDF by SHA-256. Its paths are relative to the directory containing both extracted
`Ghent_PDF_Output_Suite_V50_Patches` and `Ghent_PDF_Output_Suite_V50_Testpages` folders.
Original PDFs and generated images remain outside the repository. Do not use the download
script for this suite; use the locally supplied files.

Run from `apps/gpu-text-rendering`, with the development server running:

```sh
GPU_TEXT_MANIFEST=tests/compatibility/ghent-manifest.json \
GPU_TEXT_BASELINE=tests/compatibility/ghent-baseline.json \
GPU_TEXT_OUTPUT=/absolute/path/to/ghent-results \
pnpm test:compatibility /absolute/path/to/archive-parent
```

For discovery, set `GPU_TEXT_MANIFEST` and `GPU_TEXT_OUTPUT` when running each browser
script directly, then run `compare.py` without `--check`. After reviewing changes, use
`--write-baseline tests/compatibility/ghent-baseline.json`. A custom manifest requires
an explicit baseline in the combined check, preventing accidental comparison with PDF.js.

The numeric comparison is not the Ghent pass/fail criterion. Inspect each patch's printed
instructions and accompanying ReadMe. Crosses, missing check marks and mismatches with
embedded references matter; faint antialiasing outlines alone need not indicate failure.
Poppler and PDF.js can also fail print-specific checks. The combined reference PDF contains
a montage and separations, not six page-aligned reference images.

[ghent-review.json](ghent-review.json) records the manual observations for the reviewed run,
including the input hashes, actual-image hashes and render-report hash. It is a dated
snapshot, not an automatic verdict for future captures. Re-review affected patches when
their render changes. The baseline retains all numeric differences and unsupported inputs.
