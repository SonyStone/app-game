# ABR painting engine

`@app-game/abr-paint` applies ABR presets to a host renderer. It owns stroke sampling, adaptive LOD policy, preset preparation, decoded brush resources, and the GPU operations for Paintbrush, Pencil, Eraser, Smudge, Blur/Sharpen, and Mixer. It has no Paint app or SolidJS dependency.

`@app-game/abr-brush` remains the shared implementation of preset controls, brush dynamics, tip/pattern rasterization, and color math used by both this package and ABR Viewer. `@app-game/abr-parser` reads the file format.

## Using the engine

```ts
import { abrBrushSettings, createAbrStroke } from '@app-game/abr-paint';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';

const preset = prepareAbrBrush(parsedBrush);
const cache = createBrushResources();
for (const resource of preset.resources) cache.put(resource);
const resources = cache.open();

const stroke = createAbrStroke({
  settings: abrBrushSettings.parse(preset.engine.settings),
  resources,
  brush,       // color, size, flow, opacity, mixing, stroke.mode
  layer,       // opaque host document identity
  layers,      // ordered sources for Sample All Layers
  processor,   // add / preview / finish, optional idle
  renderer,    // AbrStrokeRenderer adapter
  adaptiveQuality: true,
  lod          // document LOD captured at contact
});

try {
  await stroke.add(samples);
  const changes = await stroke.finish();
  commit(changes); // host history/storage transaction
} catch (error) {
  stroke.cancel();
  throw error;
} finally {
  resources.release();
}
```

Cache ownership spans gestures; dispose it when the host runtime closes. `createAbrStroke` borrows resources and validates that required IDs exist before beginning renderer state. Decode untrusted settings with `abrBrushSettings` before creating a stroke. Decode idle commands with `abrBrushCommand` from `/commands` before calling `runAbrBrushCommand`.

The host serializes add, idle, finish, cancel, and tool commands. It pins resources until the gesture ends, commits returned changes atomically, and owns input dispatch, smoothing selection, document storage, history, canvas targets, device recovery, and tile eviction. Layer and change types are generic, so they do not prescribe a storage model.

In Paint, `composition/abrBrushEngine.ts` only registers this implementation with `defineBrushEngine`. Existing JSX registration and worker transport are unchanged. The tiled renderer calls the GPU modules below using its existing device and caches.

## GPU integration

| Entry | Purpose |
| --- | --- |
| `/gpu/abrStamps` | Device-owned ABR stamp rasterization and mask compositing |
| `/gpu/canvasPickup` | Capture current source tiles through a host callback |
| `/gpu/smudgePickup`, `/gpu/smudgeDepositBatch` | Ordered paint pickup and batched destination writes |
| `/gpu/canvasFilter` | Blur and Sharpen captured pixels |
| `/gpu/mixerWells`, `/gpu/toolState` | Mixer reservoirs and exact renderer handoff |
| `/gpu/commandBatch`, `/gpu/commandSlots` | Command submission and bounded uniform-slot reuse |
| `/gpu/stampBounds`, `/gpu/brushBatchSize` | Damage bounds and bounded raster work |
| `/gpu/layerComposite` | Layer compositing shared by pickup and presentation |

GPU modules borrow a TypeGPU root/device. The host must use the TypeGPU build transform for the main bundle and workers. Source tiles must remain alive until their encoded reads are submitted. Preserve per-dab dependencies for tools that sample the canvas. Raster kernels use 256px tiles, exported as `TILE_SIZE` from `/input`; changing that requires coordinated kernel and host changes.

## Regression checks

```sh
pnpm --filter @app-game/abr-paint typecheck
pnpm --filter @app-game/abr-paint test
pnpm --filter @app-game/paint test:performance
```

Package tests exercise the engine through an independent host adapter and reject imports back into applications. Paint keeps document/worker integration tests and the real-device benchmark. See [Paint performance checks](../../apps/paint/performance/README.md) for the accepted Wacom baseline and GPU correctness checks. Moving a module must preserve those results without resetting the baseline.
