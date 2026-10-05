import { readPsd, writePsd, type PsdBlend, type PsdLayer } from '@app-game/psd';
import { TILE_SIZE } from './brush';
import type { Camera, ViewSize } from './camera';
import type { BlendMode, Layer } from './document';
import { imageTiles } from './imageTiles';
import { mergeTilePixels } from './layerMerge';
import type { DocumentRect } from './layersInView';
import { packTile, unpackTile, type TileData } from './tilePixels';

/**
 * Exports `layers` as a layered Photoshop document of `region`, or of the bounds of everything drawn when it is
 * omitted. Every layer, hidden ones too, is cropped to its pixels within the canvas; the flattened image is merged as
 * `mergeTilePixels` merges layers down, in linear light with `linearBlending` as the document does; Photoshop keeps no
 * such flag in the file, so it shows the layers blended in encoded sRGB unless set to blend RGB with gamma 1.0. A canvas
 * over 30,000 pixels on a side is written as PSB. Throws when there is nothing to export or the canvas is larger than a
 * PSB allows.
 */
export async function writePsdFile(
  layers: Layer[],
  read: (data: TileData) => Promise<Uint8Array>,
  region?: DocumentRect,
  linearBlending = true
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
  const file = await writePsd(
    { width: canvas.width, height: canvas.height, layers: psdLayers },
    straightPixels(flatten(loaded, linearBlending), canvas)
  );
  return new Blob([file as Uint8Array<ArrayBuffer>], { type: 'image/vnd.adobe.photoshop' });
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

/**
 * Merges the visible layers bottom up, tile by tile, clipping each clipped layer to its base. A hidden base hides
 * the layers clipped to it, as on screen.
 */
function flatten(
  loaded: { layer: Layer; tiles: Map<string, Uint8Array> }[],
  linear: boolean
): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  let base: (typeof loaded)[number] | undefined;
  for (const entry of loaded) {
    const { layer, tiles } = entry;
    const clipped = !!layer.clipping && !!base;
    if (!clipped) {
      base = entry;
    }

    if (!layer.visible || (clipped && !base!.layer.visible)) {
      continue;
    }

    for (const [key, pixels] of tiles) {
      const merged = mergeTilePixels(
        result.get(key),
        pixels,
        layer.blend,
        layer.opacity,
        clipped ? { base: base!.tiles.get(key) } : undefined,
        linear
      );
      if (merged) {
        result.set(key, merged);
      } else {
        result.delete(key);
      }
    }
  }

  return result;
}
