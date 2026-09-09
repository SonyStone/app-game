# Wet Blender scatter measurements

Measured in Photoshop 2025 26.0.0 on 2026-09-08 using the selected original **Kyle's Paintbox - Wet Blender** from `apps/abr-viewer/src/assets/examples/megapack.abr`. The native live descriptor is in `smudge-original.json`.

The preset has a 36×25 sampled tip, diameter 50 px, angle 14°, spacing 3%, Scatter 208% on both axes, Count 3 with 100% count jitter, and Strength 90%. Size, Scatter and Count use pressure control. A scripted straight path from `[384,128]` to `[384,896]` uses `simulatePressure=false`; this isolates placement without depending on CSS pixels, monitor scaling, or tablet input. It does not establish native pen-pressure behavior.

[`photoshop-wet-blender.jsx`](../../scripts/photoshop-wet-blender.jsx) produces fresh 768×1024, 8-bit sRGB documents and restores the original documents, tool options, foreground color, units, and dialog settings. It requires the matching sampled tip to be selected for the Smudge tool. Run it through Photoshop's scripting interface. Each PNG has an accompanying effective options descriptor. The `tip`, `scatter100` and `scatter208` cases copy the tip and dynamics to the Brush tool with opaque black paint on white; `smudge` uses the selected Smudge tool on the provided red/blue/green source.

`measurements.json` records the bounding box of pixels whose maximum absolute RGB difference from the source exceeds 4. Bounds have exclusive right/bottom coordinates:

| Case                  | Affected width |
| --------------------- | -------------: |
| Tip, Scatter disabled |          51 px |
| Brush, Scatter 100%   |          97 px |
| Brush, Scatter 208%   |         153 px |
| Smudge, Scatter 208%  |         150 px |

These measurements support interpreting primary Scatter as a **total distribution width**: `50 × 2.08 = 104 px`, or ±52 px of center displacement. The old sampler displaced centers by ±104 px. In the real Paint GPU comparison, affected width changed from 250 px to 152 px with the original preset and mouse pressure 1. The spread correction leaves tip diameter and spacing unchanged. Count Jitter was corrected separately as described below.

Open `/paint-wet-blender-qa.html` on the local dev server to compare the native PNG with the corrected GPU output. The QA checks affected width, not pixel identity with Photoshop. Different random sequences, stamp filtering and smudge/color behavior remain separate parity questions. The initial correction still left a visibly rougher interior; the persistent pickup update below addresses that difference. Use Classic mixing for this comparison; Smooth color intentionally uses a different working space.

## Count Jitter

[`photoshop-scatter-count.jsx`](../../scripts/photoshop-scatter-count.jsx) isolates Count 3 with Jitter 1%, 50%, and 100% on a 10 px computed tip, 1000% spacing, and 1000% one-axis scatter. Each of the 161 groups lies on a separate X coordinate. Effective descriptors verify the settings applied by Photoshop. An attempted 0% setting was ignored by the native scripting setter and read back as 100%; that case was discarded.

At 100% jitter, the export contains empty intervals and groups with five visibly separate circles. Our former `max(1, round(count × (1 − random × jitter)))` could only produce 1–3 stamps. Native evidence supports signed variation about Count and allowing zero-stamp intervals. The sampler now uses `max(0, round(count × (1 + (2 × random − 1) × jitter) × control))`.

Rounding and a uniform signed random factor are a fitted model, not recovered Photoshop code. At 1% jitter, 91 of 161 groups contain three separate circles, supporting rounding to 3 rather than truncating half the groups to 2. At 100%, 14 blank groups are consistent with the rounded model's 1/12 zero-count probability. The exported histograms count connected components, so overlapping circles undercount actual stamps; they cannot prove the exact random-number generator or distribution. Native pen-pressure modulation remains unmeasured.

Run [`measure-wet-blender.py`](../../scripts/measure-wet-blender.py) with Pillow to regenerate `measurements.json` from the saved PNGs. Regression tests cover the fitted count ranges, spacing advancement through empty intervals, batch/preview determinism, unchanged tip size and mouse control equivalence. Correct count variation emits more stamps on average for this preset than the old reduction-only equation.

This correction applies to primary scattering in both Paint and ABR Viewer. Dual-brush scatter retains its previous behavior through an explicit sampler setting: a separate native dual probe did not establish the same mapping, so this change does not claim to fix dual-brush parity. Paint camera zoom is CSS pixels per document pixel, which also means matching “100%” labels across applications need not produce matching physical sizes.

## Sampled Smudge implementation update

The later Photoshop 26.0.0 ARM64 analysis recovered a separate sampled-Smudge path. Paint and ABR Viewer now use that path's radial Both Axes distribution, first-group handling and count arithmetic for primary sampled `SmTl` tips. Other tools and Dual Brush retain their previous models. The recovered count computation is `n = trunc(1 + (Count - 1) × control)`, then signed rounded jitter with amplitude `n × jitter / 100`, clamped to ±`trunc(amplitude)` and finally to a nonnegative count. This supersedes the fitted equation above **for sampled Smudge only**. Count and scatter have separate replayable random streams; matching Photoshop's seeds is still unverified.

Smudge also retains brush-local paint across successive dabs. Each step captures the canvas at the current dab, blends that capture with the previous pickup using Strength, then deposits the result through the current mask. The first normal contact initializes pickup without painting. Finger Painting seeds foreground color. Growing the footprint captures the new rim but deposits only the overlap with the previous footprint; resizing preserves physical brush-local coordinates. Paint uses two reusable GPU textures, while ABR Viewer implements the same recurrence on CPU and GPU.

With Classic mixing, the updated real-preset GPU fixture affects **149 px** versus **150 px** in the saved Photoshop fixture, and the interior now carries a smooth mixture. This is a width check plus visual comparison, not pixel parity. Exact native random seeds, rounding/dither, tip-bound alignment and pen-pressure behavior remain unverified. Smooth color intentionally differs from Photoshop's Classic-space comparison.

`Check ABR presets` also tests the GPU banks independently: persistent mixture, transparency, changing world/pixel dimensions, reset, foreground seeding, Smooth color and bounded allocation. Fused and reference compositing must remain pixel-identical.

### Performance check after persistent pickup

On the local in-app browser, `Measure huge smudge` rendered an 8192 px synthetic path with the production cache budget. Warm medians across three runs (excluding finish) were 946.7 ms for 512 px / 1901 stamps and 1687.0 ms for 2048 px / 471 stamps. The reference path with the same new carry behavior took 1597.3 ms and 2274.8 ms respectively; pixel hashes matched in every run. This confirms the optimized path still works with persistent pickup, not a before/after measurement of the carry change or a tablet latency claim.
