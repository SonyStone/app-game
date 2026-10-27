import { readPsd, writePsd, type PsdBlend, type PsdLayer, type PsdNewDocumentContext } from '@app-game/psd';
import { openPsd, type PsdBudgetOptions, type PsdViewerDocument } from '@app-game/psd/viewer';
import { TILE_SIZE } from './brush';
import type { Camera, ViewSize } from './camera';
import type { BlendMode, Layer } from './document';
import { imageTiles } from './imageTiles';
import type { DocumentRect } from './layersInView';
import { packTile, unpackTile, type TileData } from './tilePixels';

/**
 * Exports `layers` as a layered Photoshop document of `region`, or of the bounds of everything drawn when it is
 * omitted. Every layer, hidden ones too, is cropped to its pixels within the canvas. The composite strictly renders
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
 * Reads a Photoshop document as a drawing: its layers in order, the canvas's top-left corner at the document origin,
 * the top layer active, and a camera that fits the canvas into `view`. `capture` stores each tile, as for
 * `readPaintFile`. Throws `readPsd`'s errors for documents it cannot open.
 */
export async function readPsdFile(
  file: Blob,
  view: ViewSize,
  capture: (pixels: Uint8Array) => Promise<TileData> = async (pixels) => pixels
): Promise<{
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
