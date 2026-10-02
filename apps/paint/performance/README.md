# Brush performance regression checks

The accepted baseline is the adaptive behavior tested on the Wacom MovinkPad Pro 14. Preserve responsiveness and completed ink when changing brush sampling, renderer batching, tiles, worker scheduling, or storage. A shorter execution time caused by dropped input is a failure.

## Shared policy and specialized paths

All brush families use the document LOD captured at stroke start. Do not introduce independent zoom-percentage thresholds or let temporary loading fallback pages change brush quality. Adaptive quality defaults on and reduced detail is permanent: there is no expensive high-resolution replay after pen-up.

Round and textured brushes use LOD spacing. ABR presets also receive that spacing, with a small-tip overlap limit and their own preset spacing retained; from LOD 1 the Paintbrush, erasers and the Mixer space stamps up to 6-10% of the stamp, never beyond one and a half widths of the tip's strands, and compensate every pixel's coverage for the skipped stamps. Eligible sampled Paintbrush presets use coarse GPU masks, one level finer than the view; Smooth Smudge and Mixer can reduce pickup resolution. Classic Smudge, Blur/Sharpen, and special compositing effects retain their required paths. These are different operations, so identical optimizations or identical speed across every preset are not expected.

## Automatic checks

From the repository root:

```sh
pnpm --filter @app-game/abr-paint test
pnpm --filter @app-game/paint-core test
pnpm --filter @app-game/paint test
pnpm --filter @app-game/paint test:performance
pnpm --filter @app-game/paint typecheck
pnpm --filter @app-game/abr-paint typecheck
```

`pnpm --filter @app-game/abr-paint test` holds the full 465-preset Megapack LOD policy check (`src/megapack.test.ts`). The real-preset stamp budgets are `packages/paint-core/src/composition/brushWorkBudget.test.ts`; input batching and intermediate presentation are `runtimeLatency.test.ts` beside it. `pnpm --filter @app-game/paint test:performance` runs only the benchmark comparator tests (`node --test scripts/compare-brush-performance.test.mjs`), which the default `test` suites do not include.

`Paint regressions` runs the abr-brush, abr-paint, paint-core, navigation-puck and Paint tests and typechecks, and the benchmark comparator tests, on pull requests and pushes to master. Repository branch protection must require that job if merges should be blocked by failures.

The deterministic checks cover:

- LOD sampling policy for all 465 Adobe Megapack presets and all ABR tool families.
- Real 2B Pencil and Wet Blender long-stroke stamp budgets, coarse-mask/pickup selection, completed endpoints, and resource release.
- Bounded GPU work per batch and compact coarse-mask readback.
- Preserved input batches, intermediate presentation, bounded pending GPU frames, and the default-on setting across main-thread/worker switching.

These assert work and behavior, not wall-clock timings on a shared CI machine. The 465-preset check is policy coverage, not an assertion that every preset has been timed or visually compared.

The Megapack is not bundled with the repository or the app. `scripts/adobe-brush-fixture.mjs` downloads it from Adobe into the ignored `.tmp/adobe-brushes/` cache, pinned by SHA-256; CI caches that directory. The benchmark runner uses the same cache.

## Local headless run

Without `--cdp`, the runner launches headless Chromium with WebGPU (ANGLE Metal on macOS), starts its own Paint Vite dev server on a free loopback port, and stops both afterwards. From the repository root:

```sh
pnpm --filter @app-game/paint bench:brushes
```

Pass `--url http://localhost:3030` to use an already running dev server instead. The result JSON is written to `--output FILE`, or by default to `paint-brush-performance/<timestamp>.json` under the OS temporary directory (`os.tmpdir()`); the path is printed. `--output` inside the repository is rejected, and `--record` may write inside it only under `performance/baselines/`. The device label defaults to `headless-<platform>-<arch>`.

Desktop headless timings are not comparable with the tablet baseline; the configuration gate rejects that comparison. Use them for local A/B checks: record a baseline outside the repository before a change, then compare after it on the same machine:

```sh
pnpm --filter @app-game/paint bench:brushes --record /tmp/paint-before.json
# Apply the change, then:
pnpm --filter @app-game/paint bench:brushes --baseline /tmp/paint-before.json
```

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

With `--cdp`, `--device` is required and the dev server defaults to `http://localhost:3030`. The runner opens and closes its own test tab. It creates isolated documents, never reads saved artwork, and holds a screen wake lock during the run. It does not close Chrome. The benchmark module is not imported by the production app.

Nine workloads cover actual 2B Pencil (9/222px) and Wet Blender (222/512px), fine/coarse LODs, and Classic/Smooth mixing. They use a fixed seed, pressure 1, opacity/flow 1, a 16-tile cache, and a 512×256 output. A single long input segment stresses progress within expensive drawing work. Each case runs four times; the first warm-up is retained in the JSON and the median of the next three is compared.

The gate compares configurations by the `--device` label, the WebGPU adapter (`adapter.info` vendor, architecture, device, and description), the viewport size, and `devicePixelRatio`. The browser user agent is recorded but not compared, so a Chrome update alone does not invalidate a baseline. An adapter field that the baseline does not record cannot be verified: the runner prints a warning and continues. `movinkpad-pro14.json` predates the adapter `device` field, so it produces that warning; record a replacement to verify it.

The gate rejects different configurations, changed workloads, missing cases, changed output hashes, or increases beyond these tolerances:

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

## Megapack sweep

The nine baseline workloads cover two presets. `scripts/megapack-sweep.mjs` measures every preset of the Megapack through the production worker and IndexedDB: one long pen stroke (4000 CSS px at 1600 px/s by default) per preset and zoom, drawn across a view of the device's size, so document distance and touched tiles grow as the view zooms out. Retouch tools and erasers first receive a round stroke to work on.

```sh
adb reverse tcp:3047 tcp:3047
adb forward tcp:9224 localabstract:chrome_devtools_remote
node apps/paint/scripts/megapack-sweep.mjs --cdp http://127.0.0.1:9224 \
  --zooms 0.1,0.25,0.6 --output /tmp/paint-sweep/run.jsonl
```

The runner starts its own Paint dev server on `--port` (default 3047), which also serves the cached Megapack; a second origin would need Chrome's local-network permission on the tablet. It opens and closes its own tab, appends one JSON line per preset and zoom to `--output` (outside the repository), and skips presets already in that file, so an interrupted sweep resumes with the same command. `--presets 0-57,65,75` selects presets by library index; `--paced` sends samples on the pen's clock and reports how far drawing lags behind it. Without `--cdp` it runs in headless Chromium; keep that to a few presets.

Each row records the time from pen-down until every sample is presented (`drawMs`), its ratio to the pen's own time (`realTimeFactor`; above 1 the engine falls behind the pen), pen-up until commit (`finishMs`), the longest gap between presented frames, touched tiles and the settings that select the preset's rendering path. On the MovinkPad's view, zooms 0.1, 0.25 and 0.6 select LODs 2, 1 and 0; 0.6 is the longest stroke that still draws at full resolution.

`--quality 1,2` measures appearance instead of speed (`tests/performance/lodQuality.ts`): every preset draws the same stroke exactly, exactly with another seed, and with adaptive quality at each LOD. The strokes are composited over white (erasers and retouch tools over color stripes), reduced to the view's pixels and compared. `adaptive.ink` is the amount of paint moved relative to the exact stroke and `adaptive.difference` the mean difference in levels; `reseeded` is the preset's own stroke-to-stroke variation, below which a difference cannot be seen. Run it after changing spacing, compensation or mask LOD policy; it needs no tablet.

The dev server serves edited sources on the next request even without file watching, and the sweep restarts its worker for every preset. Do not edit engine sources during a sweep; to keep working, run it from a frozen copy of the repository (for example a detached git worktree with `node_modules` linked). A full sweep takes one to several hours, most of it in the slowest presets.

## Updating a baseline

Use `--record performance/baselines/NEW-NAME.json` instead of `--baseline` to record a new file. The runner refuses to overwrite an existing file. Keep the old baseline for comparison, inspect output changes, and check the actual app with the stylus before accepting a replacement. A timing failure should be reproduced under the same conditions; do not increase tolerances or record a slower baseline just to make the check pass.

The initial baseline records an uncommitted working tree because it captures the user-accepted implementation before committing this set of changes. Its commit field identifies the parent revision, not the entire source snapshot; keep it with the implementation in the same eventual commit.
