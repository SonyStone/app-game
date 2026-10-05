import { defaultCamera, screenToWorld, worldToScreen, type Camera, type Point } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createSelectionOverlay } from '@app-game/paint-core/gpu/selectionOverlay';
import { captureSelection, editSelection, type SelectionStorage } from '@app-game/paint-core/selection';
import {
  coverageAt,
  emptySelection,
  featherSelection,
  invertSelection,
  polygonSelection,
  type SelectionMask,
  type SelectionMode
} from '@app-game/paint-core/selectionMask';
import { snapshotDocument } from '@app-game/paint-core/storage';
import { TILE_BYTES, unpackTile } from '@app-game/paint-core/tilePixels';
import { createTileStore } from '@app-game/paint-core/tileStore';
import { tgpu } from 'typegpu';

/** Verifies shader pixels and large, disk-backed edits using a disposable canvas and database. */
export async function verifySelection(report: (message: string) => void) {
  await verifyShader(report);
  const name = `paint-lasso-qa-${crypto.randomUUID()}`;
  const store = await createTileStore(name, 4 * 1048576);
  try {
    const document = createDocument({ paged: true });
    const pixels = new Uint8Array(TILE_BYTES);
    for (let at = 0; at < TILE_BYTES; at += 4) pixels.set([80, 30, 10, 128], at);
    const original = store.capture(pixels);
    document.commit(
      Array.from({ length: 300 }, (_, i) => ({
        layerId: document.active.id,
        key: `${i % 20},${Math.floor(i / 20)}`,
        before: undefined,
        after: original
      }))
    );
    await store.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
    let peakDirty = 0,
      peakRam = 0;
    const storage: SelectionStorage = {
      read: store.read,
      write: async (data) => {
        const ref = store.capture(data);
        peakDirty = Math.max(peakDirty, store.stats().dirtyBytes);
        peakRam = Math.max(peakRam, store.stats().ramBytes);
        if (store.stats().dirtyBytes >= 8 * 1048576) await store.flush();
        return ref;
      }
    };
    const selected = await captureSelection(
      document.active,
      polygonSelection([
        { x: 0, y: 0 },
        { x: 5120, y: 0 },
        { x: 5120, y: 3840 },
        { x: 0, y: 3840 }
      ]),
      storage
    );
    assert(selected.tiles.size === 300, 'Large selection omitted occupied tiles');
    const changes = await editSelection({
      selection: selected,
      source: document.active,
      destination: document.active,
      offset: { x: -1, y: -1 },
      storage
    });
    await store.flush();
    document.commit(changes);
    await store.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
    const negative = unpackTile(await store.read(document.active.tiles.get('-1,-1')!));
    assert(negative[TILE_BYTES - 1] === 128, 'Large move lost its negative-coordinate pixel');
    assert(
      peakDirty <= 8 * 1048576 + TILE_BYTES && peakRam <= 12 * 1048576,
      `Large selection exceeded staging bounds: dirty=${peakDirty}, RAM=${peakRam}`
    );
    assert(
      [...selected.tiles.values()].every((data) => !(data instanceof Uint8Array)),
      'Clipboard retained raw tiles'
    );
    document.undo();
    assert(document.active.tiles.size === 300 && !document.active.tiles.has('-1,-1'), 'Large move undo failed');
    document.redo();
    await store.save(snapshotDocument(document.layers, document.active.id, defaultCamera()));
    // The clipboard must remain live even after collection evicts old tile versions.
    await store.collect(() => [...document.snapshots(), ...selected.tiles.values()]);
    const pasted = await editSelection({
      selection: selected,
      destination: document.active,
      offset: { x: 6000, y: 0 },
      storage
    });
    await store.flush();
    assert(
      pasted.some((change) => change.after),
      'Clipboard could not be pasted after collection'
    );
    assert(peakDirty <= 8 * 1048576 + TILE_BYTES && peakRam <= 12 * 1048576, 'Paste exceeded bounded staging memory');
    const restored = await store.load();
    assert(!!restored && restored.layers[0]!.tiles.has('-1,-1'), 'Checkpoint lost the large selection edit');
    report(
      `PASS: 300 dense tiles, 75 MiB of selected pixels, move/copy/paste/undo/redo and checkpoint restore; peak staging ${(peakDirty / 1048576).toFixed(1)} MiB, RAM ${(peakRam / 1048576).toFixed(1)} MiB`
    );
  } finally {
    const result = await store.close();
    indexedDB.deleteDatabase(name);
    if (!result.ok) throw result.error;
  }
  report('ALL LASSO CHECKS PASSED');
}

/**
 * Compares the outline the overlay draws with the edges of the expected selection: a shape preview by stencil parity
 * on screen, the selection's tiles through the camera, both combined by each mode, a dragged selection, a feathered
 * one and an inverted one; with rotated and mirrored cameras.
 */
async function verifyShader(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU adapter unavailable');
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const overlay = createSelectionOverlay(root, 'rgba8unorm');
  const overlayTarget = overlay.target();
  const view = { width: 128, height: 128 };
  const target = device.createTexture({
    size: [128, 128],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });
  const targetView = target.createView();
  const draw = async (seconds: number, camera = defaultCamera()) => {
    const encoder = device.createCommandEncoder();
    encoder.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store' }] }).end();
    overlayTarget.render(targetView, camera, view, view.width, view.height, seconds, encoder);
    device.queue.submit([encoder.finish()]);
    const buffer = device.createBuffer({
      size: 128 * 128 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    try {
      const copy = device.createCommandEncoder();
      copy.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow: 512 }, [128, 128]);
      device.queue.submit([copy.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      return new Uint8Array(buffer.getMappedRange()).slice();
    } finally {
      buffer.destroy();
    }
  };
  /** Draws and counts the outline pixels that differ from the edges of `inside`, a test of screen pixels. */
  const compare = async (camera: Camera, inside: (x: number, y: number) => boolean, what: string) => {
    const pixels = await draw(0, camera);
    assert(errors.length === 0, errors.join('\n'));
    const at = (x: number, y: number) =>
      inside(Math.max(0, Math.min(view.width - 1, x)), Math.max(0, Math.min(view.height - 1, y)));
    let mismatch = 0,
      edges = 0;
    const samples: string[] = [];
    for (let y = 0; y < view.height; y++)
      for (let x = 0; x < view.width; x++) {
        const expected = at(x, y) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !at(x + dx, y + dy)));
        const actual = pixels[(y * view.width + x) * 4 + 3]! > 0;
        if (actual) edges++;
        if (actual !== expected) {
          mismatch++;
          if (samples.length < 12) samples.push(`${x},${y}:${expected ? 'E' : 'A'}`);
        }
      }
    // Pixel centers exactly on an edge may round either way between the GPU and this test.
    assert(
      edges > 50 && mismatch <= Math.max(4, edges * 0.03),
      `${what}: ${mismatch} pixels differ of ${edges} edges (${samples.join(' ')})`
    );
    return pixels;
  };
  /** Whether the screen pixel (x, y) shows a document point the selection `mask` covers at least half. */
  const covered = (mask: SelectionMask, camera: Camera, x: number, y: number, offset = { x: 0, y: 0 }) => {
    const point = screenToWorld({ x: x + 0.5, y: y + 0.5 }, camera, view);
    return coverageAt(mask, point.x - offset.x, point.y - offset.y) >= 128;
  };
  const polygons: Point[][] = [
    [
      { x: -60.2, y: -40.2 },
      { x: 50.2, y: -40.2 },
      { x: 0.2, y: 0.2 },
      { x: 50.2, y: 40.2 },
      { x: -60.2, y: 40.2 }
    ],
    [
      { x: -55.2, y: -40.2 },
      { x: 55.2, y: 40.2 },
      { x: -55.2, y: 40.2 },
      { x: 55.2, y: -40.2 }
    ],
    [
      { x: -200.2, y: -200.2 },
      { x: 200.2, y: -200.2 },
      { x: 200.2, y: 20.2 },
      { x: -200.2, y: 20.2 }
    ]
  ];
  try {
    for (const points of polygons)
      for (const mirrored of [false, true]) {
        // A zoom that maps no screen pixel center exactly onto a document pixel edge, which either side may round.
        const camera = { ...defaultCamera(), angle: mirrored ? 0.3 : 0, mirrored, zoom: 0.853 };
        const screen = points.map((point) => worldToScreen(point, camera, view));
        overlay.set(emptySelection);
        overlay.preview({ kind: 'shape', points, mode: 'replace' });
        const pixels = await compare(camera, (x, y) => evenOdd({ x: x + 0.5, y: y + 0.5 }, screen), 'Shape preview');
        const animated = await draw(0.5, camera);
        assert(
          animated.some((value, i) => value !== pixels[i]),
          'Selection edge shader did not animate'
        );

        const mask = polygonSelection(points);
        overlay.preview(undefined);
        overlay.set(mask);
        await compare(camera, (x, y) => covered(mask, camera, x, y), 'Selection tiles');
      }

    // A shape combines with the selection on screen as the engine will combine it.
    const camera = { ...defaultCamera(), angle: 0.4, zoom: 0.9 };
    const base = polygonSelection(polygons[0]!);
    const shape = polygons[1]!;
    overlay.set(base);
    // The shape being drawn is filled at screen pixels, the selection at document pixels.
    const screenShape = shape.map((point) => worldToScreen(point, camera, view));
    const combine: Record<Exclude<SelectionMode, 'replace'>, (a: boolean, b: boolean) => boolean> = {
      add: (a, b) => a || b,
      subtract: (a, b) => a && !b,
      intersect: (a, b) => a && b
    };
    for (const mode of ['add', 'subtract', 'intersect'] as const) {
      overlay.preview({ kind: 'shape', points: shape, mode });
      await compare(
        camera,
        (x, y) => combine[mode](covered(base, camera, x, y), evenOdd({ x: x + 0.5, y: y + 0.5 }, screenShape)),
        `Mode ${mode}`
      );
    }

    overlay.preview({ kind: 'offset', offset: { x: 20, y: -10 } });
    await compare(camera, (x, y) => covered(base, camera, x, y, { x: 20, y: -10 }), 'Dragged selection');
    overlay.preview(undefined);
    const feathered = featherSelection(base, 6);
    overlay.set(feathered);
    await compare(camera, (x, y) => covered(feathered, camera, x, y), 'Feathered selection');
    const hole = invertSelection(base);
    overlay.set(hole);
    await compare(camera, (x, y) => covered(hole, camera, x, y), 'Inverted selection');

    // A lasso just begun has fewer than three points and outlines nothing yet.
    overlay.set(emptySelection);
    overlay.preview({ kind: 'shape', points: shape.slice(0, 2), mode: 'replace' });
    const begun = await draw(0);
    assert(errors.length === 0, errors.join('\n'));
    assert(
      begun.every((value) => value === 0),
      'A two-point shape drew an outline'
    );
    overlay.set(hole);
    overlay.preview({ kind: 'hidden' });
    const hidden = await draw(0);
    assert(
      hidden.every((value) => value === 0),
      'A hidden selection still showed its outline'
    );
    overlay.preview(undefined);
    overlay.set(emptySelection);
    const cleared = await draw(0);
    assert(
      cleared.every((value) => value === 0),
      'Deselect left a stale outline'
    );
    report(
      'PASS: TypeGPU selection outline matches shapes, tiles, modes, dragged, feathered and inverted selections, rotated and mirrored; animation, hiding and deselect work'
    );
    const canvas = new OffscreenCanvas(128, 128);
    const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { device });
    try {
      const document = createDocument();
      await renderer.render(document.layers, defaultCamera(), view, 1, true);
      const readCanvas = async () => {
        const bitmap = await createImageBitmap(await canvas.convertToBlob());
        const cpu = new OffscreenCanvas(128, 128).getContext('2d')!;
        cpu.drawImage(bitmap, 0, 0);
        bitmap.close();
        return cpu.getImageData(0, 0, 128, 128).data;
      };
      const baseline = await readCanvas();
      renderer.setSelection(polygonSelection(polygons[0]!), false);
      await renderer.render(document.layers, defaultCamera(), view, 1);
      const selected = await readCanvas();
      assert(
        selected.some((value, i) => value !== baseline[i]),
        'Production canvas did not present its lasso'
      );
      await renderer.render(document.layers, defaultCamera(), view, 1, true);
      const exported = await readCanvas();
      assert(
        exported.every((value, i) => value === baseline[i]),
        'PNG export included the lasso'
      );
      renderer.setSelection(emptySelection);
      await renderer.render(document.layers, defaultCamera(), view, 1);
      const empty = await readCanvas();
      assert(
        empty.every((value, i) => value === baseline[i]),
        'Production canvas did not clear its lasso'
      );
      assert(errors.length === 0, errors.join('\n'));
      report(
        'PASS: lasso shares the production WebGPU canvas, clears without stale pixels, and stays out of PNG export'
      );
    } finally {
      renderer.destroy();
    }
  } finally {
    overlay.destroy();
    target.destroy();
    root.destroy();
    device.destroy();
  }
}

/** Even-odd hit test of a point against a closed polygon. */
function evenOdd(point: Point, points: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)) {
      inside = !inside;
    }
  }

  return inside;
}

function assert(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
