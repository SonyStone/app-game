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

Implemented in Paint: sampled/computed tips; size, spacing, roundness, rotation and flips; size/angle/roundness dynamics; pressure/tilt/barrel/wheel inputs; scattering/count; color dynamics; independent transfer flow/opacity; embedded textures; secondary tips; pose overrides; build-up; preset smoothing; saved Flow/Opacity, pressure overrides and paint blend mode.

Known differences requiring reference work:

- Dual coverage is combined after primary/secondary accumulation in Paint. Viewer currently intersects primary stamps against its full secondary preview. Neither ordering has been established as Photoshop's implementation.
- Physical bristle/erodible/airbrush tips are 2D approximations, not Photoshop's physical solver.
- Mixer Brush wetness/mix/pickup and smudge behavior are not implemented. Paint rejects Mixer Brush presets explicitly instead of silently replacing their behavior.
- Height/Linear Height and Wet Edges are approximations. Wet Edges has no cross-tile diffusion halo.
- Paint currently accumulates in RGBA8; viewer uses RGBA16F. Very low coverage may differ through quantization.
- Smoothing and stochastic distributions are implementations of the exposed controls, not measured replicas of Photoshop. Initial-direction stamps need special attention at pen-down.
- Pen height is unavailable in browser input. Barrel rotation/tangential pressure require hardware/browser support.
- Foreground comes from Paint; secondary color currently defaults to white. Photoshop color management and legacy compositing settings are not emulated.
- Presets/resources are session-local. Autosave stores the raster document; export edited brush libraries from the viewer.

Missing referenced resources and unknown paint blend modes fail explicitly. Do not silently replace them with a round brush.

## Validation recorded 2026-09-07

Reproduce the metadata audit from the repository root: `pnpm exec tsx packages/abr-brush/scripts/auditExamples.ts`.

All **939 presets across eight bundled example files** parse into the shared settings schema without errors. This checks descriptor coverage, not visual parity. `halftones_and_screentones.abr` / `Kyle's Halftone - Circle Range Tiny` also verifies texture dependency, saved Dissolve mode and Flow 50%.

GPU regression: a pressure/texture/dual/color-dynamics stroke produces identical tile bytes with a one-tile cache versus a resident cache, and with single-sample versus batched input. Disposable tails are exercised while drawing. Run `verifyAbrBrush` from Paint's isolated browser QA host. Unit tests cover replay state, preview rollback, >16,384 stamps, wheel control and rotation interpolation; input tests cover axes and build-up disposal.

Photoshop 2025 was inspected in a separate temporary document using the same Circle Range Tiny preset. Mouse drawing and saved tool settings were checked. No automated pixel/pressure comparison with Photoshop has been established; the native stylus comparison suite remains required before claiming parity.
