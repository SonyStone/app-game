# Brush Settings compatibility

The editor now has detailed settings panels and shared CPU/GPU previews for ordinary sampled and computed brushes. This is **not a claim of complete Photoshop parity**. Saving a field correctly, rendering an effect, and matching Photoshop's pixels are separate checks.

## Implemented coverage

| Panel                              | Editing and ABR export                                                                                                  | Preview behavior                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Brush Tip Shape                    | Size, spacing toggle/value, angle, roundness, hardness for computed tips, flips                                         | Sample aspect ratio, transformed stamps, spacing                                            |
| Shape Dynamics                     | Size/angle/roundness jitter, controls, fade steps, minimums, tilt scale, flip jitter, projection                        | Deterministic dynamics using synthetic or pointer input                                     |
| Scattering                         | Scatter, both axes, count, count jitter, control/fade                                                                   | Independent stamp placement and count                                                       |
| Texture                            | Embedded pattern selection, invert, scale, brightness, contrast, per-tip mode, blend mode, depth/minimum/jitter/control | Grayscale/RGB embedded textures, per-tip or whole-stroke coverage                           |
| Dual Brush                         | Secondary imported tip, mode, flip, size, spacing, scatter, axes, count                                                 | Separate secondary stroke masks the primary stroke                                          |
| Color Dynamics                     | Foreground/background jitter/control, hue, saturation, brightness, purity, per-tip toggle                               | Color changes per stamp or once per stroke                                                  |
| Transfer                           | Opacity/flow jitter, control/fade/minimum; mixer wetness/mix values when applicable                                     | Separate flow accumulation and local opacity ceiling; mixer paint mixing is not implemented |
| Brush Pose                         | Tilt X/Y, rotation, pressure, individual overrides                                                                      | Overrides feed dynamics and projection                                                      |
| Noise / Wet Edges / Build-up       | Individual flags                                                                                                        | Grain, approximate edge darkening, timed stationary stamps                                  |
| Smoothing                          | Amount, pulled string, catch-up, catch-up on end, zoom adjustment                                                       | Approximate smoothing of drawn paths                                                        |
| Protect Texture                    | Preset flag                                                                                                             | Preserved for Photoshop; no cross-tool texture state in this editor                         |
| Bristle / erodible / airbrush tips | Specialized scalar properties for imported tip types                                                                    | Procedural 2D approximation, not Photoshop's physical solver                                |

Disabled groups retain their values. Opening a preset does not rewrite it. Editing clones the affected descriptor branches; unknown fields and original binary resources remain available to the writer. Resource selection retains the secondary sample or pattern needed by exports.

Descriptor bindings are in `src/features/brush-detail/settings-fields.ts`. For example, Scatter uses the top-level `scatterDynamics`, Count uses `Cnt `, opacity uses `prVr`, flow uses `opVr`, and secondary settings live in `dualBrush`. Angle jitter is a percentage, not an angle unit. Bristle density/length/thickness/stiffness/clumping use Photoshop's stored fractional values.

## Remaining compatibility work

- Native Photoshop import, inspect, re-save, and compare for every newly edited control. An attempted Photoshop 2025 scripting run did not execute in this session. The new settings have not passed that native round trip.
- Physical bristle bending, erodible custom heightmaps and evolving wear, and Photoshop's airbrush solver. Original data is preserved, but the preview generates an approximate tip. Erodible softness direction and airbrush variant mappings still need native confirmation.
- Mixer Brush canvas paint pickup, wetness, load, mix, and cleaning behavior. Showing and saving its dynamics does not simulate paint mixing.
- Exact Photoshop texture Height/Linear Height blending, noise, wet edges, dual-brush interactions, and smoothing. Current formulas are approximations, not measured pixel matches.
- Hardware wheel/dial input, native tablet calibration, and control-enum confirmation. Browser pointer pressure, tilt and twist work; unavailable device axes use synthetic values.
- Photoshop category locks, cross-tool Protect Texture state, erodible sharpening, and creating/switching physical tip families. Those application workflows are not implemented.
- Pattern modes beyond grayscale/RGB. Unsupported resources show a preview notice and retain their original bytes for export.

## Validation on 2026-09-06

- Viewer production build and TypeScript checks pass.
- 124 viewer tests cover setting round trips, independent native-key assertions, untouched-data preservation, visible rendering effects, input behavior, queue lifetime and resource transfer.
- 194 parser tests pass, including embedded pattern decoding and malformed resource rejection.
- All 948 presets in the nine local Downloads ABR files passed form validation and remained unchanged when opened. This checks compatibility with that corpus, not arbitrary ABR files.
- 207 embedded patterns decoded from eight Downloads libraries. The remaining library was not part of that pattern-decoding run.
- Eleven real WebGPU cases compare with the CPU implementation. These comparisons do not establish Photoshop pixel parity.
- With the 139-brush watercolor file, changing texture brightness updated only the selected card and inspector canvas. Undo restored 9; redo restored 27. Visible previews used the GPU without resource errors.

## Halftone preview correction on 2026-09-06

All 76 embedded patterns in `halftones_and_screentones.abr` decode successfully. The missing halftones came from preview compositing: per-tip textures restarted in tip-local coordinates, Height depth was mixed as opacity, and Dual Brush Hard Mix was limited to the original soft coverage. Patterns now remain anchored to canvas pixels, Height depth controls paint height, and Hard Mix can produce opaque edges within the primary tip.

Circle Range Tiny was inspected in Photoshop 2025 at its original 9% depth and at 50%, then restored to 9%. Higher depth fills more of the pattern. Height and Linear Height use the [Krita Photoshop-height approximation](https://docs.krita.org/en/reference_manual/brushes/brush_settings/texture.html), with depth scaling described in its [compositing implementation](https://github.com/KDE/krita/blob/master/libs/ui/tool/strokes/KisMaskingBrushCompositeOp.h). This is a behavioral correction, not a claim of Photoshop pixel parity. Exported brush settings and embedded resources are unchanged.

Regression tests cover the actual Circle Range Tiny preset, dark/light relief, depth changes, dense overlap, and Hard Mix coverage. Fourteen browser GPU cases pass CPU comparisons, including Height, Linear Height, and Height with Dual Brush Hard Mix; device-loss handling also passes. The full test command has a separate existing failure because `example-assets.test.ts` imports the missing `scripts/check-example-assets.mjs`.

## References

Adobe describes [brush dynamics and fade](https://helpx.adobe.com/photoshop/using/adding-dynamic-elements-brushes.html) and [textured brush behavior](https://helpx.adobe.com/photoshop/using/creating-textured-brushes.html). The [Photoshop file format reference](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/) documents descriptor and pattern structures. Actual imported descriptors informed the field bindings; these sources do not specify the full Photoshop brush renderer.
