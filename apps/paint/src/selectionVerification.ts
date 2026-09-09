import { tgpu } from 'typegpu';
import { defaultCamera, worldToScreen, type Point } from './camera';
import { createDocument } from './document';
import { createLassoOverlay } from './gpu/lassoOverlay';
import { createPaintRenderer } from './gpu/renderer';
import { captureSelection, editSelection, pointInSelection, type SelectionStorage } from './selection';
import { snapshotDocument } from './storage';
import { TILE_BYTES, unpackTile } from './tilePixels';
import { createTileStore } from './tileStore';

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
      [
        { x: 0, y: 0 },
        { x: 5120, y: 0 },
        { x: 5120, y: 3840 },
        { x: 0, y: 3840 }
      ],
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
    await store.collect([...document.snapshots(), ...selected.tiles.values()]);
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

/** Compare actual fragment alpha against the same even-odd mask used to edit document pixels. */
async function verifyShader(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU adapter unavailable');
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const overlay = createLassoOverlay(root, 'rgba8unorm');
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
    device.queue.submit([encoder.finish()]);
    overlay.render(targetView, camera, view, view.width, view.height, seconds);
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
        const camera = { ...defaultCamera(), angle: mirrored ? 0.3 : 0, mirrored, zoom: 0.85 };
        overlay.set(points);
        const pixels = await draw(0, camera);
        assert(errors.length === 0, errors.join('\n'));
        const screen = points.map((point) => worldToScreen(point, camera, view));
        const mask = (x: number, y: number) =>
          pointInSelection(
            { x: Math.max(0, Math.min(view.width - 1, x)) + 0.5, y: Math.max(0, Math.min(view.height - 1, y)) + 0.5 },
            screen
          );
        let mismatch = 0,
          edges = 0;
        for (let y = 0; y < view.height; y++)
          for (let x = 0; x < view.width; x++) {
            const expected = mask(x, y) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !mask(x + dx, y + dy)));
            const actual = pixels[(y * view.width + x) * 4 + 3]! > 0;
            if (actual) edges++;
            if (actual !== expected) mismatch++;
          }
        assert(
          edges > 50 && mismatch <= 4,
          `Lasso shader disagrees with pixel mask: ${mismatch} pixels, ${edges} edges`
        );
        const animated = await draw(0.5, camera);
        assert(
          animated.some((value, i) => value !== pixels[i]),
          'Lasso edge shader did not animate'
        );
      }
    overlay.set([]);
    const cleared = await draw(0);
    assert(
      cleared.every((value) => value === 0),
      'Deselect left a stale outline'
    );
    report(
      'PASS: TypeGPU mask/edge shaders match concave, crossing, clipped, rotated and mirrored selections; animation and deselect work'
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
      renderer.setSelection(polygons[0]!, false);
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
      renderer.setSelection([]);
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

function assert(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
