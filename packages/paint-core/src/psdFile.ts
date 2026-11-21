import { readPsd, writePsd, type PsdBlend, type PsdLayer, type PsdNewDocumentContext } from '@app-game/psd';
import { openPsd, type PsdBudgetOptions, type PsdViewerDocument } from '@app-game/psd/viewer';
import { TILE_SIZE } from './brush';
import type { Camera, ViewSize } from './camera';
import type { BlendMode, Layer } from './document';
import { imageTiles } from './imageTiles';
import type { DocumentRect } from './layersInView';
import { composeStack, normalized, quantized, stackItems, type StackItem } from './layerStack';
import { groupMode, isFlatStack, type CompositeGroup, type ShownLayer } from './layerTree';
import { packTile, unpackTile, type TileData } from './tilePixels';

/**
 * Exports `layers` as a layered Photoshop document of `region`, or of the bounds of everything drawn when it is
 * omitted. `layers` are raster layers, as `psdExportLayers` gives them for a drawing: its folders written flat,
 * without section dividers, each layer inside a hidden folder hidden, and folders that composite on their own
 * rasterized. Every layer, hidden ones too, is cropped to its pixels within the canvas. The composite strictly renders
 * the serialized layers with Photoshop's byte opacity and the document's `linearBlending` setting. Photoshop's
 * application preference must match that setting when recompositing the file. A canvas
 * over 30,000 pixels on a side is written as PSB. Throws when there is nothing to export or the canvas is larger than a
 * PSB allows. `context` selects complete first-save creation; its caller-owned IDs and layer clocks must follow
 * `layers` order, including hidden and empty layers. Omission retains the codec's identity-only compatibility mode.
 * Invalid complete-mode operands throw PsdWriteError; supplied context is never replaced with legacy defaults.
 * Composites in 512² regions with bounded render scratch. The host still needs one full straight-RGBA buffer.
 * Throws PsdExportCompositeError when that buffer cannot fit the WASM32 writer or the layers cannot render exactly.
 */
export async function writePsdFile(
  layers: Layer[],
  read: (data: TileData) => Promise<Uint8Array>,
  region?: DocumentRect,
  linearBlending = true,
  context?: PsdNewDocumentContext
): Promise<Blob> {
  const loaded = await Promise.all(
    layers.map(async (layer) => {
      const tiles = new Map<string, Uint8Array>();
      for (const [key, data] of layer.tiles) {
        tiles.set(key, unpackTile(data instanceof Uint8Array ? data : await read(data)));
      }

      return { layer, tiles };
    })
  );
  const canvas = region ?? unionBounds(loaded.map(({ tiles }) => alphaBounds(tiles)));
  if (!canvas || canvas.width < 1 || canvas.height < 1) {
    throw new Error('There is nothing to export yet.');
  }

  const composite = allocateComposite(canvas);
  const psdLayers = loaded.map(({ layer, tiles }): PsdLayer => {
    const bounds = intersect(alphaBounds(tiles), canvas) ?? { left: canvas.left, top: canvas.top, width: 0, height: 0 };
    return {
      name: layer.name,
      left: bounds.left - canvas.left,
      top: bounds.top - canvas.top,
      width: bounds.width,
      height: bounds.height,
      pixels: straightPixels(tiles, bounds),
      opacity: layer.opacity,
      visible: layer.visible,
      blend: layer.blend,
      clipping: !!layer.clipping,
      transparencyLocked: !!layer.alphaLock
    };
  });
  const document = { width: canvas.width, height: canvas.height, layers: psdLayers };
  // Only the serialized layers are rendered. Reuse the empty provisional composite for the final straight pixels.
  const file = await writePsd(document, composite, context);
  const retainedBytes =
    composite.byteLength +
    psdLayers.reduce((bytes, layer) => bytes + layer.pixels.byteLength, 0) +
    loaded.reduce((bytes, { tiles }) => bytes + [...tiles.values()].reduce((sum, tile) => sum + tile.byteLength, 0), 0);
  const budget = compositeBudget(file.byteLength, retainedBytes, canvas.width);
  const opened = await openPsd(file, budget);
  if (!opened.ok) {
    throw new PsdExportCompositeError('OpenFailed', opened.error.message, { cause: opened.error });
  }

  try {
    for (let top = 0; top < canvas.height; top += compositeTileSize) {
      for (let left = 0; left < canvas.width; left += compositeTileSize) {
        copyCompositeTile(
          opened.value,
          composite,
          canvas.width,
          {
            left,
            top,
            width: Math.min(compositeTileSize, canvas.width - left),
            height: Math.min(compositeTileSize, canvas.height - top)
          },
          linearBlending,
          budget
        );
      }
    }
  } finally {
    opened.value.close();
  }

  const final = await writePsd(document, composite, context);
  return new Blob([final as Uint8Array<ArrayBuffer>], { type: 'image/vnd.adobe.photoshop' });
}

/**
 * The raster layers a Photoshop document gets for `layers`, as `createDocument`'s `layers` has them, for
 * `writePsdFile`, each with the ids of the drawing's raster layers it stands for (`sources`), bottom first. A flat
 * stack (`isFlatStack`) is written as it is. Otherwise folders are still written flat, without section dividers, and
 * what a flat stack cannot show is rasterized, so the file composites as the drawing shows:
 *
 * - a folder that blends on its own (not Pass Through) becomes one layer named as the folder (`folderName`), holding
 *   its layers composited on their own, with the folder's blend mode and opacity;
 * - a fading Pass Through folder becomes one Normal layer that shows over what is below it what the folder shows there:
 *   what the folder added, with the backdrop baked in where the backdrop is opaque. Where a translucent backdrop is
 *   darkened by the folder's layers, no such layer exists, and it is the closest one, clamped;
 * - a layer clipped to a folder is written unclipped, its pixels multiplied by the folder's coverage.
 *
 * A hidden folder writes its layers flat and hidden, as a hidden Pass Through folder does. Composites on the CPU
 * (`composeStack`) in the document's blending, `linear`; `read` loads stored tiles.
 */
export async function psdExportLayers(
  layers: readonly ShownLayer[],
  folderName: (id: string) => string,
  read: (data: TileData) => Promise<Uint8Array>,
  linear: boolean
): Promise<PsdExportLayer[]> {
  const plain = (layer: ShownLayer): PsdExportLayer => {
    const { group: _group, clipGroup: _clipGroup, ...own } = layer;
    return { ...own, sources: [layer.id] };
  };
  if (isFlatStack(layers)) {
    return layers.map(plain);
  }

  const loaded = new Map<Layer, Map<string, Promise<Uint8Array>>>();
  const tile = (layer: Layer, key: string) => {
    const data = layer.tiles.get(key);
    if (!data) {
      return undefined;
    }

    let tiles = loaded.get(layer);
    if (!tiles) {
      tiles = new Map();
      loaded.set(layer, tiles);
    }

    let pixels = tiles.get(key);
    if (!pixels) {
      pixels = (async () => unpackTile(data instanceof Uint8Array ? data : await read(data)))();
      tiles.set(key, pixels);
    }

    return pixels;
  };
  const compose = (stack: readonly ShownLayer[], key: string, backdrop?: Float32Array) =>
    composeStack(stack, TILE_SIZE * TILE_SIZE, (layer) => tile(layer, key), linear, backdrop);
  const keysOf = (stack: readonly Layer[]) => new Set(stack.flatMap((layer) => [...layer.tiles.keys()]));
  const inside = (group: CompositeGroup) => layers.filter((layer) => within(layer.group, group));
  /** The layers of `group` as a stack of their own, without the folder and the folders around it. */
  const isolated = (group: CompositeGroup) => {
    const cut = new Map<CompositeGroup, CompositeGroup | undefined>();
    const below = (folder: CompositeGroup | undefined): CompositeGroup | undefined => {
      if (!folder || folder === group) {
        return undefined;
      }

      if (!cut.has(folder)) {
        const parent = below(folder.parent);
        const { parent: _parent, ...own } = folder;
        cut.set(folder, parent ? { ...own, parent } : own);
      }

      return cut.get(folder);
    };
    return inside(group).map((layer) => {
      const { group: folder, clipGroup, ...own } = layer;
      const shown: ShownLayer = own;
      const nested = below(folder);
      const clippedTo = below(clipGroup);
      return { ...shown, ...(nested ? { group: nested } : {}), ...(clippedTo ? { clipGroup: clippedTo } : {}) };
    });
  };
  const rasterized = async (
    group: CompositeGroup,
    pixels: (key: string) => Promise<Uint8Array | undefined>
  ): Promise<PsdExportLayer> => {
    const stack = inside(group);
    const tiles = new Map<string, Uint8Array>();
    for (const key of keysOf(stack)) {
      const result = await pixels(key);
      if (result) {
        tiles.set(key, result);
      }
    }

    return {
      id: group.id,
      name: folderName(group.id),
      visible: true,
      opacity: groupMode(group) === 'isolated' ? group.opacity : 1,
      blend: groupMode(group) === 'isolated' ? (group.blend as BlendMode) : 'normal',
      tiles,
      sources: stack.map(({ id }) => id)
    };
  };

  const out: PsdExportLayer[] = [];
  const write = async (items: readonly StackItem[]) => {
    for (const item of items) {
      if (item.type === 'layer') {
        const { layer } = item;
        if (!layer.clipGroup) {
          out.push(plain(layer));
          continue;
        }

        // Clipped to a folder: the folder's coverage, which a hidden folder or one at zero opacity does not have.
        const base = layer.clipGroup;
        const covered = base.visible && base.opacity > 0 ? isolated(base) : [];
        const tiles = new Map<string, Uint8Array>();
        for (const [key] of layer.tiles) {
          const own = await tile(layer, key)!;
          const coverage = await compose(covered, key);
          const baked = quantized(scaledByAlpha(normalized(own), coverage));
          if (baked.some((value, index) => index % 4 === 3 && value > 0)) {
            tiles.set(key, baked);
          }
        }

        out.push({ ...plain(layer), clipping: false, tiles });
        continue;
      }

      const { group } = item;
      const mode = groupMode(group);
      if (!group.visible || mode === 'pass-through') {
        await write(item.items);
        continue;
      }

      if (mode === 'isolated') {
        const stack = isolated(group);
        out.push(await rasterized(group, async (key) => opaqueOrNothing(quantized(await compose(stack, key)))));
        continue;
      }

      // Fading: the backdrop it entered with is everything below its first layer, composited.
      const first = layers.findIndex((layer) => within(layer.group, group));
      const last = layers.findLastIndex((layer) => within(layer.group, group));
      const backdrop = layers.slice(0, first);
      const through = layers.slice(0, last + 1);
      out.push(
        await rasterized(group, async (key) => {
          const before = await compose(backdrop, key);
          return opaqueOrNothing(quantized(difference(before, await compose(through, key), linear)));
        })
      );
    }
  };
  await write(stackItems(layers));
  return out;
}

/** A layer `psdExportLayers` writes: raster layer properties, its pixels, and the drawing's layers it stands for. */
export type PsdExportLayer = Layer & { sources: readonly string[] };

/** Whether `folder` is `group` or inside it. */
function within(folder: CompositeGroup | undefined, group: CompositeGroup): boolean {
  for (let current = folder; current; current = current.parent) {
    if (current === group) {
      return true;
    }
  }

  return false;
}

/** `pixels`, or undefined when every pixel is transparent. */
function opaqueOrNothing(pixels: Uint8Array): Uint8Array | undefined {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index]) {
      return pixels;
    }
  }

  return undefined;
}

/** Premultiplied `pixels` with every pixel scaled by the alpha of the same pixel of `coverage`. */
function scaledByAlpha(pixels: Float32Array, coverage: Float32Array): Float32Array {
  const out = new Float32Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const k = coverage[index + 3]!;
    for (let channel = 0; channel < 4; channel++) {
      out[index + channel] = pixels[index + channel]! * k;
    }
  }

  return out;
}

/**
 * The Normal layer that turns `backdrop` into `result` when composited over it (both premultiplied, 0–1), in linear
 * light with `linear`. Where the backdrop is translucent, its alpha follows from the two alphas; where it is opaque,
 * the least alpha that keeps the layer's colors within it. Colors outside the layer's alpha are clamped, which happens
 * only where a translucent backdrop is darkened.
 */
function difference(backdrop: Float32Array, result: Float32Array, linear: boolean): Float32Array {
  const out = new Float32Array(backdrop.length);
  const b = [0, 0, 0, 0],
    f = [0, 0, 0, 0];
  for (let index = 0; index < backdrop.length; index += 4) {
    let same = true;
    for (let channel = 0; channel < 4; channel++) {
      b[channel] = backdrop[index + channel]!;
      f[channel] = result[index + channel]!;
      same &&= Math.abs(b[channel]! - f[channel]!) < 1 / 1024;
    }

    if (same) {
      continue;
    }

    if (linear) {
      toLinear(b);
      toLinear(f);
    }

    const ba = b[3]!;
    let alpha: number;
    if (ba < 1 - 1 / 1024) {
      alpha = (f[3]! - ba) / (1 - ba);
    } else {
      alpha = 0;
      for (let channel = 0; channel < 3; channel++) {
        const bc = b[channel]!,
          fc = f[channel]!;
        alpha = Math.max(alpha, bc > 0 ? 1 - fc / bc : 0, bc < 1 ? (fc - bc) / (1 - bc) : 0);
      }
    }

    alpha = Math.min(1, Math.max(0, alpha));
    const layer = [0, 0, 0, alpha];
    for (let channel = 0; channel < 3; channel++) {
      layer[channel] = Math.min(alpha, Math.max(0, f[channel]! - b[channel]! * (1 - alpha)));
    }

    if (linear) {
      toSrgb(layer);
    }

    out.set(layer, index);
  }

  return out;
}

/** Premultiplied sRGB to premultiplied linear light, in place, as `composeStack` decodes. */
function toLinear(pixel: number[]) {
  convert(pixel, (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
}

/** Premultiplied linear light to premultiplied sRGB, in place. */
function toSrgb(pixel: number[]) {
  convert(pixel, (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
}

function convert(pixel: number[], curve: (value: number) => number) {
  const alpha = pixel[3]!;
  for (let channel = 0; channel < 3; channel++) {
    pixel[channel] = alpha > 0 ? curve(Math.min(1, Math.max(0, pixel[channel]! / alpha))) * alpha : 0;
  }
}

/** Refuses an export whose serialized layers cannot produce an exact, full-canvas Photoshop composite. */
export class PsdExportCompositeError extends Error {
  readonly name = 'PsdExportCompositeError';

  /** Preserves allocation and renderer diagnostics as the cause of failures. */
  constructor(
    readonly code: 'OpenFailed' | 'RenderFailed' | 'Approximation' | 'Dimensions' | 'AllocationFailed',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

/** Whether `file` starts with the Photoshop signature. */
export async function isPsdFile(file: Blob) {
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return String.fromCharCode(...signature) === '8BPS';
}

/**
 * Reads a Photoshop document as a drawing: its raster layers in order, flat at the root, the canvas's top-left corner
 * at the document origin, the top layer active, and a camera that fits the canvas into `view`. `capture` stores each
 * tile, as for `readPaintFile`. Throws `readPsd`'s errors for documents it cannot open.
 */
export async function readPsdFile(
  file: Blob,
  view: ViewSize,
  capture: (pixels: Uint8Array) => Promise<TileData> = async (pixels) => pixels
): Promise<{
  /** The layer tree: `layers` at the root, as Photoshop groups do not open as folders yet. */
  nodes: Layer[];
  layers: Layer[];
  activeId: string;
  camera: Camera;
  features: Record<string, unknown>;
  linearBlending: boolean;
}> {
  const psd = await readPsd(await file.arrayBuffer());
  const layers: Layer[] = [];
  for (const source of psd.layers) {
    const tiles = new Map<string, TileData>();
    const pixels = new Uint8ClampedArray(source.pixels.buffer, source.pixels.byteOffset, source.pixels.length);
    for (const [key, tile] of imageTiles(pixels, source.width, source.height, source.left, source.top)) {
      tiles.set(key, await capture(packTile(tile)));
    }

    layers.push({
      id: crypto.randomUUID(),
      name: source.name || `Layer ${layers.length + 1}`,
      visible: source.visible,
      // Without layer effects Fill scales a layer like opacity, except in the eight modes where Photoshop treats it apart.
      opacity: source.opacity * (source.fill ?? 1),
      blend: importedBlends[source.blend] ?? 'normal',
      ...(source.transparencyLocked ? { alphaLock: true } : {}),
      ...(source.clipping ? { clipping: true } : {}),
      tiles
    });
  }

  const zoom = Math.max(0.05, Math.min(1, (0.9 * view.width) / psd.width, (0.9 * view.height) / psd.height));
  return {
    nodes: layers,
    layers,
    activeId: layers.at(-1)!.id,
    camera: { x: psd.width / 2, y: psd.height / 2, zoom, angle: 0, mirrored: false },
    features: {},
    // Photoshop blends in encoded sRGB unless its color settings say otherwise, which the file does not record.
    linearBlending: false
  };
}

/** Allocates the required host composite, refusing sizes the WASM32 writer cannot address. */
function allocateComposite(canvas: DocumentRect): Uint8Array {
  const bytes = canvas.width * canvas.height * 4;
  try {
    if (!Number.isSafeInteger(bytes) || bytes > 0x7fffffff) {
      throw new RangeError('The straight RGBA composite exceeds the WASM32 writer limit of 2 GiB.');
    }

    return new Uint8Array(bytes);
  } catch (cause) {
    throw new PsdExportCompositeError('AllocationFailed', 'Cannot allocate the PSD export composite.', { cause });
  }
}

/**
 * Admits compressed source storage plus caller-owned canvas/layers and bounded tile scratch. Opening counts both
 * input copies; four file lengths also cover the parsed channels and render-time host input. Scratch follows the
 * viewer's conservative accounting for a flat RGB8 stack: eight work canvases at 128 bytes per pixel,
 * 16 bytes per output pixel and a full-width channel row at 64 bytes per pixel. Export writes raster layers
 * without groups, masks or effects, so no full-support dependencies or group canvases are needed.
 * 512² tiles keep even this estimate below the previous 1024² scratch allowance, without raising limits.
 * Admission stays within WASM32's 4 GiB address space. Larger source documents still fail with the viewer's typed
 * budget/allocation cause rather than disabling limits.
 */
function compositeBudget(sourceBytes: number, retainedBytes: number, width: number): PsdBudgetOptions {
  const scratchBytes = compositeTileSize ** 2 * (128 * 8 + 16) + width * 64 + 196_608;
  return {
    allocationBytes: Math.max(128 * 1024 * 1024, sourceBytes),
    liveBytes: Math.min(0xffffffff, retainedBytes + sourceBytes * 4 + scratchBytes),
    retainedBytes
  };
}

/** Copies one exact straight-RGBA region; the region API frees its WASM scratch before returning owned pixels. */
function copyCompositeTile(
  document: PsdViewerDocument,
  composite: Uint8Array,
  canvasWidth: number,
  rectangle: DocumentRect,
  linearBlending: boolean,
  budget: PsdBudgetOptions
): void {
  const rendered = document.renderRegion(rectangle, {
    linearBlending,
    approximate: false,
    textGamma: 1.45,
    vectorPaths: false,
    typeLayers: false,
    smartObjects: null,
    maxWorkPixels: compositeTileSize * compositeTileSize,
    budget
  });
  if (!rendered.ok) {
    throw new PsdExportCompositeError('RenderFailed', rendered.error.message, { cause: rendered.error });
  }

  const tile = rendered.value;
  if (tile.approximations.length || !tile.exactToLayerRender || tile.source !== 'layers') {
    throw new PsdExportCompositeError('Approximation', tile.approximations.join('; ') || 'The PSD tile is not exact.');
  }

  if (
    tile.left !== rectangle.left || tile.top !== rectangle.top || tile.width !== rectangle.width ||
    tile.height !== rectangle.height || tile.step !== 1 || tile.pixels.length !== tile.width * tile.height * 4
  ) {
    throw new PsdExportCompositeError('Dimensions', 'The PSD composite tile does not match the requested rectangle.');
  }

  for (let y = 0; y < tile.height; y++) {
    composite.set(
      tile.pixels.subarray(y * tile.width * 4, (y + 1) * tile.width * 4),
      ((tile.top + y) * canvasWidth + tile.left) * 4
    );
  }
}

/** Bounds render scratch independently of the canvas area. */
const compositeTileSize = 512;

/** Photoshop blend modes Paint has; the others open as Normal. */
const importedBlends: Partial<Record<PsdBlend, BlendMode>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay'
};

/** The smallest rectangle around the pixels with alpha in premultiplied tiles keyed `"x,y"`. */
function alphaBounds(tiles: Map<string, Uint8Array>): DocumentRect | undefined {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [key, pixels] of tiles) {
    const [tx, ty] = key.split(',').map(Number) as [number, number];
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        if (pixels[(y * TILE_SIZE + x) * 4 + 3]) {
          left = Math.min(left, tx * TILE_SIZE + x);
          right = Math.max(right, tx * TILE_SIZE + x + 1);
          top = Math.min(top, ty * TILE_SIZE + y);
          bottom = Math.max(bottom, ty * TILE_SIZE + y + 1);
        }
      }
    }
  }

  return left < right ? { left, top, width: right - left, height: bottom - top } : undefined;
}

function unionBounds(rects: (DocumentRect | undefined)[]): DocumentRect | undefined {
  return rects.reduce<DocumentRect | undefined>((union, rect) => {
    if (!rect || !union) {
      return rect ?? union;
    }

    const left = Math.min(union.left, rect.left),
      top = Math.min(union.top, rect.top);
    const right = Math.max(union.left + union.width, rect.left + rect.width);
    const bottom = Math.max(union.top + union.height, rect.top + rect.height);
    return { left, top, width: right - left, height: bottom - top };
  }, undefined);
}

function intersect(rect: DocumentRect | undefined, canvas: DocumentRect): DocumentRect | undefined {
  if (!rect) {
    return undefined;
  }

  const left = Math.max(rect.left, canvas.left),
    top = Math.max(rect.top, canvas.top);
  const right = Math.min(rect.left + rect.width, canvas.left + canvas.width);
  const bottom = Math.min(rect.top + rect.height, canvas.top + canvas.height);
  return left < right && top < bottom ? { left, top, width: right - left, height: bottom - top } : undefined;
}

/** Copies `rect` out of premultiplied tiles as straight RGBA, as PSD channels store it. */
function straightPixels(tiles: Map<string, Uint8Array>, rect: DocumentRect): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height * 4);
  for (let ty = Math.floor(rect.top / TILE_SIZE); ty * TILE_SIZE < rect.top + rect.height; ty++) {
    for (let tx = Math.floor(rect.left / TILE_SIZE); tx * TILE_SIZE < rect.left + rect.width; tx++) {
      const tile = tiles.get(`${tx},${ty}`);
      if (!tile) {
        continue;
      }

      const x0 = Math.max(rect.left, tx * TILE_SIZE),
        x1 = Math.min(rect.left + rect.width, (tx + 1) * TILE_SIZE);
      const y0 = Math.max(rect.top, ty * TILE_SIZE),
        y1 = Math.min(rect.top + rect.height, (ty + 1) * TILE_SIZE);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const from = ((y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE)) * 4;
          const alpha = tile[from + 3]!;
          if (!alpha) {
            continue;
          }

          const to = ((y - rect.top) * rect.width + (x - rect.left)) * 4;
          for (let channel = 0; channel < 3; channel++) {
            out[to + channel] = Math.min(255, Math.round((tile[from + channel]! * 255) / alpha));
          }

          out[to + 3] = alpha;
        }
      }
    }
  }

  return out;
}
