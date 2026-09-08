# ABR preset engine

Shared preset interpretation and brush algorithms for ABR Viewer and Paint Studio. No Solid owner, DOM element, document storage or GPU device is created by this package. Hosts supply pixels, input samples and render targets.

- `form`: descriptor ↔ editable values, validation, saved tool options. Unknown descriptor fields remain intact when the editor writes changes.
- `settings-fields`: descriptor bindings and editor labels/ranges.
- `stroke`: incremental stamp generation in document pixels, deterministic replay, reversible previews, preset smoothing, preview path fitting, computed tips.
- `resources`: resolve/decode embedded pattern and secondary-tip dependencies.
- `physical-tip`: approximate 2D images of physical tips.
- `effects`: texture/dual coverage operations shared by CPU and GPU.
- `paintBlend`: paint-tool blend modes, separate from texture/dual blend modes.

## Runtime contract

`createAbrStrokeSampler` owns one gesture. Feed chronological points in document coordinates; consume only the new packed stamps returned by `add`. `preview` snapshots and restores spacing, fade, random state, previous sample and stroke color. Document strokes have no 16,384-stamp cap; the standalone preview adapter retains that cap because its GPU buffer is fixed. Real gestures use a fresh seed; deterministic tests/replays can supply one.

Each stamp contains four vec4s: center/radii, rotation/flips, flow/opacity/texture-depth/noise-seed, color. Culling must use the circumscribed radius, not either half-extent. Tilt and rotation must survive input processing and worker transport. Pen height is not exposed by browser Pointer Events; it is never synthesized from canvas coordinates.

Paint registers the engine and preset processor through its JSX composition. Its raw/None processor bypasses preset smoothing. Build-up receives stationary samples from an explicitly disposed Solid Primitives timer. Rendering is incremental and resources are pinned for the gesture, including previews. Primary color, primary flow/opacity and secondary coverage have independent tile scratch; eviction must preserve all three.

## Compatibility status

This is **not yet Photoshop-equivalent**. Reading all fields is not proof that every algorithm has been reproduced.

Implemented in Paint: sampled/computed tips; size, spacing, roundness, rotation and flips; size/angle/roundness dynamics; pressure/tilt/barrel/wheel inputs; scattering/count; color dynamics; independent transfer flow/opacity; embedded textures; secondary tips; pose overrides; build-up; preset smoothing; saved Flow/Opacity, pressure overrides, RGB foreground/background colors and paint blend mode.

Known differences requiring reference work:

- Pencil has binary coverage and contact-based Auto Erase. Sampled-tip thresholds, pixel placement, partial-alpha color matching and color-management behavior need native calibration.

- Dual coverage is combined after primary/secondary accumulation in Paint. Viewer currently intersects primary stamps against its full secondary preview. Neither ordering has been established as Photoshop's implementation.
- Physical bristle/erodible/airbrush tips are 2D approximations, not Photoshop's physical solver.
- Mixer Brush uses GPU pigment wells and canvas pickup in Paint and Viewer. Shared well exchange, depletion and compositing functions keep their model consistent; exchange rates and pickup geometry still require native calibration. Each Viewer gesture starts from a fresh two-layer sample and foreground-loaded wells, so it does not demonstrate cross-stroke Auto Load/Clean state. Blur/Sharpen use full-resolution tile filters; their kernels and Protect Detail are also approximations. Viewer now applies these filters sequentially to a two-layer preview fixture using the same retouch color/compositing functions. See [tool options status](TOOL_OPTIONS.md).
- Height/Linear Height and Wet Edges are approximations. Wet Edges has no cross-tile diffusion halo.
- Paint currently accumulates in RGBA8; viewer uses RGBA16F. Very low coverage may differ through quantization.
- Smoothing and stochastic distributions are implementations of the exposed controls, not measured replicas of Photoshop. Initial-direction stamps need special attention at pen-down.
- Pen height is unavailable in browser input. Barrel rotation/tangential pressure require hardware/browser support.
- Saved RGB/HSB/Gray/Lab D50 foreground/background colors are applied when present. Otherwise foreground comes from Paint and secondary color defaults to white. Unknown or profile-dependent saved colors fail explicitly when applying in Paint and survive unrelated editor changes. Lab converts to the sRGB canvas with clipping; out-of-gamut colors can differ from Photoshop and the editor identifies them. Saved CMYK colors use an explicitly selected ICC source profile in Tool Options; the original CMYK descriptor remains in exported ABRs. Full Photoshop color management is not emulated; `useLegacy` and `pressureSmoothing` are explicitly stored-only options with unverified runtime semantics.
- Presets/resources are session-local. Autosave stores the raster document; export edited brush libraries from the viewer.

Missing referenced resources and unknown paint blend modes fail explicitly. Do not silently replace them with a round brush.

## Validation recorded 2026-09-07

Reproduce the metadata audit from the repository root: `pnpm exec tsx packages/abr-brush/scripts/auditExamples.ts`.

All **939 presets across eight bundled example files** parse into the shared settings schema without errors. This checks descriptor coverage, not visual parity. `halftones_and_screentones.abr` / `Kyle's Halftone - Circle Range Tiny` also verifies texture dependency, saved Dissolve mode and Flow 50%.

GPU regression: a pressure/texture/dual/color-dynamics stroke produces identical tile bytes with a one-tile cache versus a resident cache, and with single-sample versus batched input. Disposable tails are exercised while drawing. Run `verifyAbrBrush` from Paint's isolated browser QA host. Unit tests cover replay state, preview rollback, >16,384 stamps, wheel control and rotation interpolation; input tests cover axes and build-up disposal.

Paint applies its pressure/tool opacity ceiling after coverage effects, before Dissolve's stochastic coverage. Raw opacity and soft-tip-weighted opacity have separate MAX channels; accumulated flow lives in the premultiplied paint texture's alpha. Hard Mix uses raw opacity because its binary coverage replaces the tip's gray coverage. Capping it with soft-tip-weighted opacity makes the entire stroke too pale. Other dual modes retain the soft-tip ceiling. This uses existing tile scratch, without extra textures.

The GPU regression includes white and gray tips with opacity controlled by falling pressure at tool opacity 100% and 25%; both must retain a dense head and fade at the tail. Multiply and Hard Mix also exercise eviction, batching and disposable previews. These synthetic controls are not a matched Photoshop stylus recording.

Transfer wire bindings are `prVr` → Flow and `opVr` → Opacity, as independently documented by [ag-psd's ABR reader](https://github.com/Agamnentzar/ag-psd/blob/master/src/abr.ts). Earlier tests with `Charcoal Champ 3` had these reversed and therefore checked the wrong behavior. The bundled preset regression now asserts pressure-controlled Flow (8% jitter, 0% minimum), constant Opacity (1% jitter), and tilt-controlled size/texture depth. Sampling the real preset at identical tilt/seed but different pressure must change Flow without changing Opacity, size or texture depth. Reselect imported presets after this change; existing runtime settings snapshots retain their previous interpretation until reapplied.

Photoshop 2025 was inspected in a separate temporary document using the same Circle Range Tiny preset. Mouse drawing and saved tool settings were checked. No automated pixel/pressure comparison with Photoshop has been established; the native stylus comparison suite remains required before claiming parity.

`verifyAbrEraser` also checks a native ErTl preset against existing opaque ink: 50% opacity reduces premultiplied RGB and alpha together; results are pixel-identical with a one-tile cache and disposable tails; undo/redo restores exact tile snapshots. Pencil/Block and Erase to History have separate verifiers; see [current tool status](TOOL_OPTIONS.md) for their remaining native calibration work. Viewer previews now erase a sample layer to checkerboard transparency; Erase to History restores that sample layer. Each preview stroke resets the fixture independently of the Paint document.

Smudge (`SmTl`) now transports sampled canvas pixels in Paint. Strength controls transfer amount; Finger Painting deposits the foreground color at the start; Sample All Layers includes visible layers' opacity and blend modes. Tool behavior follows the options described by [Adobe](https://helpx.adobe.com/photoshop/using/tool-techniques/smudge-tool.html), but the pixel transport algorithm has not been calibrated against a matched Photoshop recording. Viewer now transports pixels sequentially on a two-layer sample, using the same pickup allocation plan and Finger Painting/compositing functions as Paint. Each preview gesture starts fresh. CPU and GPU references include both bilinear capture and bilinear patch sampling, including RGBA8 quantization. Predicted Smudge tails are disabled until pickup state can be rolled back without modifying real ink.

The renderer's `captureRegion` returns a borrowed GPU patch valid until the next capture or disposal. It excludes disposable previews and sees active stroke output across cache eviction. Patches default to 1024 pixels per side and 12 MiB of reusable scratch; large regions are filtered and capped to 4096 source tiles. Capture itself performs no CPU readback, though the underlying tile cache may evict active tiles. Source and consumer operations must be serialized. GPU checks cover tile seams, layer composition, actual input versus tails, Strength, current/all-layer isolation, Finger Painting, dual tips, batching and eviction.


Saved Gray (`Grsc`, `Gry `) now converts to the native sRGB paint result: 0% is white, 100% is black. The editor preserves original precision and unknown fields until the color is edited. Native `SolidColor.rgb` readback differs from actual Gray fills and Brush pixels and must not be used as the paint oracle. See the Gray/profile measurements in [tool options status](TOOL_OPTIONS.md). CMYK uses the editor’s explicit ICC profile selection described below.


Saved CMYK colors use LittleCMS with the selected source ICC profile and generated sRGB destination, relative-colorimetric intent and black point compensation. Select the same CMYK working profile as Photoshop in Tool Options. The profile belongs to the editor session; it is not inferred from ABR or bundled with the application. Previews react to profile replacement. Paint receives detached RGB colors, so closing the editor or replacing its profile cannot alter an applied brush. Unrelated edits/export retain the original CMYK values and unknown data; explicit color edits replace them with RGB.

The real WASM converter was checked against 15 retained Photoshop sRGB fill samples with U.S. Web Coated (SWOP) v2. Maximum channel error is 3/255. This is functional color conversion, not Adobe ACE equivalence. Run `pnpm exec tsx packages/abr-brush/scripts/verifyCmykProfile.ts /path/to/USWebCoatedSWOP.icc` from the repository root. The local Adobe profile is not redistributed.
