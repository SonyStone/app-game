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

## Validation and limits

Run the Paint and ABR Viewer tests and typechecks from the workspace. These cover application behavior, resource lifetime, batching, and deterministic replay. `scripts/auditExamples.ts` checks bundled presets against the settings schema.

Complete Photoshop equivalence has not been established. Physical tips, Mixer Brush, and several filter behaviors remain approximations. Browser input support also limits pen axes.

Photoshop captures, executable analysis, comparison suites, and the detailed compatibility record live in the sibling [photoshop-analysis project](../../../photoshop-analysis/integration/README.md). The product has no runtime, build, or test dependency on that project.
