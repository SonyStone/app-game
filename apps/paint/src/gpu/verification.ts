import { verifySparseStroke } from './sparseStrokeVerification';
import { unpackTile } from '../tilePixels';
import { defaultBrush, type Dab } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument, type BlendMode, type Layer, type TileChange } from '../document';
import { createPaintRenderer } from './renderer';

/** Runs pixel-level checks on a real GPU. Uses isolated documents and never writes the user's autosave. */
export async function verifyGpu(report: (message: string) => void) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  let renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { cacheTiles: 2 });
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  const brush = { ...defaultBrush(), color: '#ff0000', hardness: 1, flow: 1, opacity: 0.4, pressureSize: false };
  const dab: Dab = { x: 256, y: 128, radius: 20, flow: 1 };
  try {
    const document = createDocument();
    renderer.begin(document.active, brush);
    await renderer.paint([dab, dab, dab]);
    const seam = await renderer.finish();
    const a = pixel(seam, 255, 128),
      b = pixel(seam, 256, 128);
    assert(Math.abs(a[3]! - 102) <= 1 && a[3] === b[3], `Tile seam or stroke opacity mismatch: ${a} / ${b}`);
    report('PASS: brush crosses tile edges with matching alpha; stroke opacity stays at 40%');
    document.commit(seam);
    renderer.begin(document.active, { ...brush, tool: 'eraser', opacity: 0.5 });
    await renderer.paint([dab]);
    const erased = await renderer.finish();
    assert(Math.abs(pixel(erased, 256, 128)[3]! - 51) <= 1, 'Eraser did not halve the destination alpha');
    report('PASS: eraser uses destination-out and preserves premultiplied pixels');

    renderer.reset();
    const blank = createDocument();
    const stamps = Array.from({ length: 30 }, (_, i) => ({ x: -20 + i * 3, y: 10, radius: 12, flow: 0.25 }));
    renderer.begin(blank.active, brush);
    await renderer.paint(stamps);
    const together = await renderer.finish();
    renderer.reset();
    renderer.begin(blank.active, brush);
    for (const stamp of stamps) await renderer.paint([stamp]);
    const separate = await renderer.finish();
    assert(equalTiles(together, separate), 'GPU stroke changed when sample batches were split');
    report('PASS: batched and individually submitted stamps produce identical GPU pixels');

    renderer.reset();
    renderer.begin(blank.active, { ...brush, opacity: 1 });
    await renderer.paint([
      { x: 20, y: 20, radius: 4, flow: 0.5 },
      { x: 300, y: 20, radius: 4, flow: 0.5 },
      { x: 600, y: 20, radius: 4, flow: 0.5 }
    ]);
    assert(renderer.stats().residentTiles <= 2, 'Tile cache exceeded its configured bound');
    await renderer.paint([{ x: 20, y: 20, radius: 4, flow: 0.5 }]);
    const evicted = await renderer.finish();
    assert(Math.abs(pixel(evicted, 20, 20)[3]! - 192) <= 1, 'Active mask did not survive GPU eviction');
    assert(Math.abs(pixel(evicted, 300, 20)[3]! - 128) <= 1, 'Evicted output pixels were lost');
    report('PASS: active masks and output pixels survive eviction under a two-tile GPU budget');

    const base = [51, 179, 102],
      source = [204, 51, 128];
    for (const blend of ['normal', 'multiply', 'screen', 'overlay'] as const) {
      renderer.reset();
      const layers = [solidLayer('base', base, 1), solidLayer('source', source, 0.5, blend)];
      await renderer.render(layers, { ...defaultCamera(), x: 128, y: 128 }, { width: 256, height: 256 }, 1);
      const actual = await readCanvas(canvas);
      const expected = expectedBlend(base, source, blend, 0.5);
      assert(
        expected.every((value, index) => Math.abs(value - actual[index]!) <= 3),
        `${blend} mismatch: ${actual} expected ${expected}`
      );
    }
    report('PASS: Normal, Multiply, Screen and per-channel Overlay match reference compositing');

    document.undo();
    renderer.reset();
    assert(document.active.tiles.size === 0, 'Undo left pixels in the document');
    document.redo();
    renderer.destroy();
    renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
    await renderer.render(document.layers, { ...defaultCamera(), x: 256, y: 128 }, { width: 256, height: 256 }, 1);
    const restoredPixel = await readCanvas(canvas);
    assert(restoredPixel[0]! > restoredPixel[1]! + 50, 'Restored GPU device did not display committed pixels');
    report('PASS: undo/redo snapshots remain valid after destroying and recreating the GPU renderer');
    renderer.destroy();
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    let lostResolve!: () => void;
    const lost = new Promise<void>((resolve) => {
      lostResolve = resolve;
    });
    renderer = await createPaintRenderer(canvas, () => lostResolve(), { device });
    await renderer.render(document.layers, { ...defaultCamera(), x: 256, y: 128 }, { width: 256, height: 256 }, 1);
    device.destroy();
    await lost;
    renderer.destroy();
    renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
    await renderer.render(document.layers, { ...defaultCamera(), x: 256, y: 128 }, { width: 256, height: 256 }, 1);
    const afterLoss = await readCanvas(canvas);
    assert(
      afterLoss.every((byte, index) => byte === restoredPixel[index]),
      'Device loss changed committed pixels'
    );
    report('PASS: real GPUDevice loss is reported and a replacement device renders identical pixels');
    assert(errors.length === 0, errors.join('\n'));
    await verifyReuse(report);
    await verifyDirtyView(report);
    await verifyColorMixing(report);
    await verifyDisplayCache(report);
    await verifySparseStroke(report);
    report('ALL GPU CHECKS PASSED');
  } finally {
    renderer.destroy();
  }
}

/** Both stroke and layer paths must produce a bright red/green midpoint with unchanged alpha. */
async function verifyColorMixing(report: (message: string) => void) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error));
  const camera = { ...defaultCamera(), x: 128, y: 128 };
  const size = { width: 256, height: 256 };
  try {
    for (const [baseColor, brushColor] of [
      [[255, 0, 0], '#00ff00'],
      [[0, 255, 0], '#ff0000']
    ] as const) {
      renderer.reset();
      const base = solidLayer('base', [...baseColor], 1);
      renderer.begin(base, { ...defaultBrush(), color: brushColor, mixing: 'linear', opacity: 0.5, hardness: 1 });
      await renderer.paint([{ x: 128, y: 128, radius: 30, flow: 1 }]);
      const result = pixel(await renderer.finish(), 128, 128);
      if (Math.abs(result[0]! - 188) > 1 || Math.abs(result[1]! - 188) > 1 || result[2] !== 0 || result[3] !== 255)
        throw new Error(`Dark or incorrect stroke mix: ${result}`);
    }
    renderer.reset();
    const layers = [solidLayer('red', [255, 0, 0], 1), solidLayer('green', [0, 255, 0], 0.5, 'linear')];
    await renderer.render(layers, camera, size, 1);
    const result = await readCanvas(canvas);
    if (Math.abs(result[0]! - 188) > 1 || Math.abs(result[1]! - 188) > 1 || result[2] !== 0)
      throw new Error(`Dark or incorrect layer mix: ${result}`);
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'PASS: Smooth color mixes red/green to RGB(188,188,0) for strokes in both orders and for layers, without a dark midpoint'
    );
  } finally {
    renderer.destroy();
  }
}

/** Compares every displayed byte with a full redraw, including eviction, erasing, cancel, and camera changes. */
async function verifyDirtyView(report: (message: string) => void) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), { cacheTiles: 16 });
  const document = createDocument();
  const background = solidLayer('background', [40, 90, 130], 1).tiles.get('0,0')!;
  for (let x = -7; x < 7; x++) for (let y = -7; y < 7; y++) document.active.tiles.set(`${x},${y}`, background);
  document.changeLayer({ type: 'add' });
  const brush = { ...defaultBrush(), color: '#ff0000', opacity: 0.6 };
  let camera = { ...defaultCamera(), zoom: 0.05 };
  const size = { width: 256, height: 256 };
  const compare = async (label: string) => {
    const incremental = await canvasPixels(canvas);
    renderer.invalidateView();
    await renderer.render(document.layers, camera, size, 1);
    const full = await canvasPixels(canvas);
    if (!full.every((byte, i) => byte === incremental[i]))
      throw new Error(`${label}: dirty view differs from full redraw`);
  };
  try {
    await renderer.render(document.layers, camera, size, 1);
    for (const blend of ['normal', 'multiply', 'screen', 'overlay'] as const) {
      document.changeLayer({ type: 'update', id: document.active.id, patch: { blend } });
      await renderer.render(document.layers, camera, size, 1);
      renderer.begin(document.active, brush);
      for (const x of [-300, 0, 300]) {
        await renderer.paint([{ x, y: 0, radius: 100, flow: 0.5 }]);
        await renderer.render(document.layers, camera, size, 1);
      }
      document.commit(await renderer.finish());
      await compare(blend);
    }
    camera = { ...camera, angle: 0.6, mirrored: true };
    await renderer.render(document.layers, camera, size, 1);
    renderer.begin(document.active, { ...brush, tool: 'eraser', opacity: 1 });
    await renderer.paint([{ x: 0, y: 0, radius: 400, flow: 1 }]);
    await renderer.render(document.layers, camera, size, 1);
    document.commit(await renderer.finish());
    await compare('rotated mirrored eraser');
    renderer.begin(document.active, brush);
    await renderer.paint([{ x: 0, y: 0, radius: 400, flow: 1 }]);
    await renderer.render(document.layers, camera, size, 1);
    renderer.cancel();
    await renderer.render(document.layers, camera, size, 1);
    await compare('cancel');
    if (renderer.stats().residentTiles > 16) throw new Error('Dirty view exceeded tile-cache budget');
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'PASS: incremental viewport matches full redraw pixel-for-pixel with 196 background tiles, 16 cached tiles, all blends, rotation, mirror, eraser and cancel'
    );
  } finally {
    renderer.destroy();
  }
}

async function canvasPixels(canvas: OffscreenCanvas): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const scratch = new OffscreenCanvas(canvas.width, canvas.height);
  const context = scratch.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Real-device regression checks for resident stroke reuse, GPU clears, batched readback, and deferred mips. */
async function verifyReuse(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  let uploads = 0,
    textures = 0,
    maps = 0;
  const createTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor) => {
    textures++;
    return createTexture(descriptor);
  };
  const writeTexture = device.queue.writeTexture.bind(device.queue);
  device.queue.writeTexture = (destination, data, layout, size) => {
    uploads += data.byteLength;
    Reflect.apply(writeTexture, device.queue, [destination, data, layout, size]);
  };
  const createBuffer = device.createBuffer.bind(device);
  device.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    const map = buffer.mapAsync.bind(buffer);
    buffer.mapAsync = (...args) => {
      maps++;
      return map(...args);
    };
    return buffer;
  };
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), { device });
  const document = createDocument();
  const brush = { ...defaultBrush(), color: '#ff0000', hardness: 1, opacity: 0.25 };
  const camera = { ...defaultCamera(), x: 256, y: 128 };
  const size = { width: 256, height: 256 };
  try {
    let alpha = 0;
    let warmTextures = 0;
    for (let i = 0; i < 10; i++) {
      renderer.begin(document.active, brush);
      await renderer.paint([{ x: 256, y: 128, radius: 20, flow: 1 }]);
      await renderer.render(document.layers, camera, size, 1);
      const beforeMaps = maps;
      const changes = await renderer.finish();
      if (maps - beforeMaps !== 1) throw new Error('Stroke readback must map once for both resident tiles');
      alpha = Math.round(255 * 0.25 + alpha * 0.75);
      if (Math.abs(pixel(changes, 256, 128)[3]! - alpha) > 2) throw new Error('Reused stroke mask changed opacity');
      document.commit(changes);
      if (i === 0) warmTextures = textures;
      else if (textures !== warmTextures) throw new Error('Resident strokes allocated additional GPU textures');
    }
    if (uploads !== 0) throw new Error(`Resident strokes uploaded ${uploads} texture bytes from CPU`);
    await renderer.render(document.layers, { ...camera, zoom: 0.25 }, size, 1);
    const zoomed = await readCanvas(canvas);
    if (zoomed[0]! < zoomed[1]! + 100) throw new Error('Deferred mipmaps lost painted pixels when zooming out');
    await device.queue.onSubmittedWorkDone();
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'PASS: repeated strokes reuse textures, upload zero texture bytes, map once, and preserve opacity/zoomed pixels'
    );
  } finally {
    renderer.destroy();
    device.destroy();
  }
}

function pixel(changes: TileChange[], x: number, y: number): number[] {
  const tx = Math.floor(x / 256),
    ty = Math.floor(y / 256);
  const pixels = changes.find((c) => c.key === `${tx},${ty}`)?.after;
  const offset = ((y - ty * 256) * 256 + x - tx * 256) * 4;
  return pixels ? [...unpackTile(pixels).slice(offset, offset + 4)] : [0, 0, 0, 0];
}
function equalTiles(a: TileChange[], b: TileChange[]) {
  return (
    a.length === b.length &&
    a.every((tile) => {
      const other = b.find((b) => b.key === tile.key)?.after;
      const left = tile.after && unpackTile(tile.after),
        right = other && unpackTile(other);
      return left?.length === right?.length && left?.every((byte, i) => byte === right?.[i]);
    })
  );
}
function solidLayer(id: string, color: number[], opacity: number, blend: BlendMode = 'normal'): Layer {
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([...color, 255], i);
  return { id, name: id, opacity, blend, visible: true, tiles: new Map([['0,0', pixels]]) };
}
async function readCanvas(canvas: OffscreenCanvas): Promise<number[]> {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const scratch = new OffscreenCanvas(256, 256),
    context = scratch.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [...context.getImageData(128, 128, 1, 1).data];
}
function expectedBlend(base: number[], source: number[], mode: BlendMode, opacity: number): number[] {
  return base.map((byte, index) => {
    const b = byte / 255,
      s = source[index]! / 255;
    const blend =
      mode === 'multiply'
        ? b * s
        : mode === 'screen'
          ? 1 - (1 - b) * (1 - s)
          : mode === 'overlay'
            ? b <= 0.5
              ? 2 * b * s
              : 1 - 2 * (1 - b) * (1 - s)
            : s;
    return Math.round((b * (1 - opacity) + blend * opacity) * 255);
  });
}

/** Checks reduced display textures against native tiles, plus warm navigation and mutation invalidation. */
async function verifyDisplayCache(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  let uploads = 0;
  const write = device.queue.writeTexture.bind(device.queue);
  device.queue.writeTexture = (...args) => {
    uploads += args[1].byteLength;
    Reflect.apply(write, device.queue, args);
  };
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(1, 1),
    referenceCanvas = new OffscreenCanvas(1, 1);
  const renderer = await createPaintRenderer(canvas, (e) => errors.push(e), { device, cacheTiles: 2 });
  const reference = await createPaintRenderer(referenceCanvas, (e) => errors.push(e), { displayCache: false });
  const document = createDocument();
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const alpha = (x + y) % 256;
      pixels.set([Math.round((x * alpha) / 255), Math.round((y * alpha) / 255), alpha >> 1, alpha], (y * 256 + x) * 4);
    }
  for (let x = -7; x < 7; x++) for (let y = -7; y < 7; y++) document.active.tiles.set(`${x},${y}`, pixels);
  const size = { width: 512, height: 512 };
  let camera = { ...defaultCamera(), zoom: 0.1 };
  const compare = async () => {
    await renderer.render(document.layers, camera, size, 1);
    reference.reset();
    await reference.render(document.layers, camera, size, 1);
    const a = await canvasPixels(canvas),
      b = await canvasPixels(referenceCanvas);
    let max = 0;
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
    if (max > 2) throw new Error(`Display mip mismatch at zoom ${camera.zoom}: ${max}`);
  };
  try {
    await compare();
    uploads = 0;
    for (let i = 0; i < 8; i++) {
      camera = { ...camera, x: i * 5, y: -i * 3, angle: i * 0.01, mirrored: i % 2 === 0 };
      await renderer.render(document.layers, camera, size, 1);
    }
    if (uploads !== 0) throw new Error(`Warm camera movement uploaded ${uploads} bytes`);
    for (const zoom of [0.24, 0.51, 1.2, 0.08]) {
      camera = { ...camera, zoom };
      await compare();
    }
    for (const tool of ['brush', 'eraser'] as const) {
      renderer.begin(document.active, { ...defaultBrush(), tool, color: '#ff0000' });
      await renderer.paint([{ x: 0, y: 0, radius: 60, flow: 1 }]);
      document.commit(await renderer.finish());
      await compare();
    }
    document.undo();
    renderer.reset();
    await compare();
    renderer.reset();
    document.active.tiles.clear();
    for (let x = -16; x < 16; x++) for (let y = -16; y < 16; y++) document.active.tiles.set(`${x},${y}`, pixels);
    camera = { ...defaultCamera(), zoom: 0.04 };
    await renderer.render(document.layers, camera, size, 1);
    uploads = 0;
    await renderer.render(document.layers, { ...camera, x: 10, zoom: 0.05 }, size, 1);
    if (uploads !== 0 || renderer.stats().displayTiles !== 1024)
      throw new Error('Maximum-size overview did not remain resident');
    if (renderer.stats().gpuBytes > 97 * 1024 * 1024) throw new Error('Display cache exceeded memory budget');
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      'PASS: camera movement uploads zero warm tile bytes; display mips match native rendering through pan/zoom/rotate/mirror, paint, erase and undo; 1024-tile overview stays resident within budget'
    );
  } finally {
    renderer.destroy();
    reference.destroy();
    device.destroy();
  }
}
