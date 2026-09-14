# Brush performance regression checks

The accepted baseline is the adaptive behavior tested on the Wacom MovinkPad Pro 14. Preserve responsiveness and completed ink when changing brush sampling, renderer batching, tiles, worker scheduling, or storage. A shorter execution time caused by dropped input is a failure.

## Shared policy and specialized paths

All brush families use the document LOD captured at stroke start. Do not introduce independent zoom-percentage thresholds or let temporary loading fallback pages change brush quality. Adaptive quality defaults on and reduced detail is permanent: there is no expensive high-resolution replay after pen-up.

Round and textured brushes use LOD spacing. ABR presets also receive that spacing, with a small-tip overlap limit and their own preset spacing retained. Eligible sampled Paintbrush presets use coarse GPU masks; Smooth Smudge and Mixer can reduce pickup resolution. Classic Smudge, Blur/Sharpen, and special compositing effects retain their required paths. These are different operations, so identical optimizations or identical speed across every preset are not expected.

## Automatic checks

From the repository root:

```sh
pnpm --filter @app-game/paint test:performance
pnpm --filter @app-game/paint test:ui
pnpm --filter @app-game/paint typecheck
```

`Paint regressions` runs all Paint tests, UI tests, TypeScript, and the benchmark comparator tests on pull requests and pushes to master. Repository branch protection must require that job if merges should be blocked by failures.

The deterministic checks cover:

- LOD sampling policy for all 465 bundled Megapack presets and all ABR tool families.
- Real 2B Pencil and Wet Blender long-stroke stamp budgets, coarse-mask/pickup selection, completed endpoints, and resource release.
- Bounded GPU work per batch and compact coarse-mask readback.
- Preserved input batches, intermediate presentation, bounded pending GPU frames, and the default-on setting across main-thread/worker switching.

These assert work and behavior, not wall-clock timings on a shared CI machine. The 465-preset check is policy coverage, not an assertion that every preset has been timed or visually compared.

## Wacom timing baseline

Start the Paint dev server, connect the unlocked tablet with USB debugging enabled, and keep Chrome visible. Use the same power mode, orientation, and idle background workload as the baseline. From the repository root:

```sh
pnpm --filter @app-game/paint dev
# In another terminal:
adb reverse tcp:3030 tcp:3030
adb forward tcp:9224 localabstract:chrome_devtools_remote
pnpm --filter @app-game/paint bench:brushes \
  --cdp http://127.0.0.1:9224 --device movinkpad-pro14 \
  --baseline performance/baselines/movinkpad-pro14.json \
  --output /tmp/paint-performance-result.json
```

The runner opens and closes its own test tab. It creates isolated documents, never reads saved artwork, and holds a screen wake lock during the run. It does not close Chrome. The benchmark module is not imported by the production app.

Nine workloads cover actual 2B Pencil (9/222px) and Wet Blender (222/512px), fine/coarse LODs, and Classic/Smooth mixing. They use a fixed seed, pressure 1, opacity/flow 1, a 16-tile cache, and a 512×256 output. A single long input segment stresses progress within expensive drawing work. Each case runs four times; the first warm-up is retained in the JSON and the median of the next three is compared.

The gate rejects different device/browser/viewport configurations, changed workloads, missing cases, changed output hashes, or increases beyond these tolerances:

| Metric | Allowed increase over baseline |
| --- | --- |
| Draw duration | 25% + 10 ms |
| Finish/readback duration | 35% + 10 ms |
| Longest progress-frame gap | 35% + 16 ms |
| Stamp count | 10% |
| GPU submissions | 15% + 8 |
| Resident GPU bytes after finish | 15% + 1 MiB |

Run with `--verify` to additionally check adaptive Paintbrush, Smudge, Blur/Sharpen, and Mixer GPU output at LOD 0 and 3. Batching, preview, history, and eviction comparisons remain exact. Fused-versus-multipass Smudge allows one RGBA8 quantization step because Adreno rounds a few channels differently. This longer verification run is useful for rendering changes.

Timing measures engine/GPU throughput and progress delivery; it does not measure physical stylus latency, browser input dispatch, brush-library loading, or app autosave. Cold-start times are recorded but not gated because browser shader caches vary. Keep a manual long-stroke check in the actual app at fine and coarse LODs before releasing tablet-facing performance changes.

## Updating a baseline

Use `--record performance/baselines/NEW-NAME.json` instead of `--baseline` to record a new file. The runner refuses to overwrite an existing file. Keep the old baseline for comparison, inspect output changes, and check the actual app with the stylus before accepting a replacement. A timing failure should be reproduced under the same conditions; do not increase tolerances or record a slower baseline just to make the check pass.

The initial baseline records an uncommitted working tree because it captures the user-accepted implementation before committing this set of changes. Its commit field identifies the parent revision, not the entire source snapshot; keep it with the implementation in the same eventual commit.
