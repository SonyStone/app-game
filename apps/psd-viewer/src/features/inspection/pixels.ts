import type { PsdImage, PsdLayerPixels, PsdSavedProcessChannels } from '@app-game/psd/viewer';
import { displayTiles, type DisplayImage } from '../gpu-viewport/displayTiles';

/** Samples the finest resident tile covering a document coordinate; absent coverage stays unknown. */
export function displayPixel(image: DisplayImage, x: number, y: number) {
  const tile = [...displayTiles(image)]
    .sort((a, b) => a.step - b.step)
    .find(
      (tile) =>
        x >= tile.clip.left &&
        y >= tile.clip.top &&
        x < tile.clip.left + tile.clip.width &&
        y < tile.clip.top + tile.clip.height
    );
  if (!tile) {
    return undefined;
  }

  const column = Math.floor((x - tile.left) / tile.step);
  const row = Math.floor((y - tile.top) / tile.step);
  return {
    rgba: [
      ...tile.image.pixels.subarray((row * tile.image.width + column) * 4, (row * tile.image.width + column) * 4 + 4)
    ],
    step: tile.step
  };
}

/** Reads original big-endian saved plane values, preserving float32 rather than converting through RGB8. */
export function nativeSample(
  channels: PsdSavedProcessChannels,
  planeIndex: number,
  x: number,
  y: number
): number | undefined {
  const plane = channels.planes[planeIndex];
  if (!plane || x < 0 || y < 0 || x >= channels.width || y >= channels.height) {
    return undefined;
  }

  if (channels.depth === 1) {
    const byte = plane.bytes[y * Math.ceil(channels.width / 8) + Math.floor(x / 8)];
    return byte === undefined ? undefined : (byte >> (7 - (x % 8))) & 1;
  }

  const offset = ((y * channels.width + x) * channels.depth) / 8;
  if (offset + channels.depth / 8 > plane.bytes.byteLength) {
    return undefined;
  }

  const view = new DataView(plane.bytes.buffer, plane.bytes.byteOffset, plane.bytes.byteLength);
  return channels.depth === 32
    ? view.getFloat32(offset, false)
    : channels.depth === 16
      ? view.getUint16(offset, false)
      : view.getUint8(offset);
}

/** A single admitted saved plane as display gray RGB8. Native float values are clamped only for this preview. */
export function channelImage(channels: PsdSavedProcessChannels, planeIndex: number): PsdImage {
  const pixels = new Uint8Array(channels.width * channels.height * 4);
  const maximum = channels.depth === 16 ? 65535 : channels.depth === 8 ? 255 : 1;
  for (let y = 0; y < channels.height; y++) {
    for (let x = 0; x < channels.width; x++) {
      const value = Math.round(
        Math.max(0, Math.min(1, (nativeSample(channels, planeIndex, x, y) ?? 0) / maximum)) * 255
      );
      pixels.set([value, value, value, 255], (y * channels.width + x) * 4);
    }
  }

  return { width: channels.width, height: channels.height, pixels };
}

/** Saved mask pixels, located in document space. Overlay uses inverse mask coverage in translucent red. */
export function maskImage(mask: PsdLayerPixels['masks'][number], overlay = false): DisplayImage {
  const pixels = new Uint8Array(mask.values.length * 4);
  mask.values.forEach((value, index) =>
    pixels.set(overlay ? [255, 40, 40, Math.round((255 - value) * 0.6)] : [value, value, value, 255], index * 4)
  );
  return { width: mask.width, height: mask.height, pixels, window: { left: mask.left, top: mask.top, step: 1 } };
}

/** Gives an empty constant mask bounded document coverage for display/export; never decodes additional source pixels. */
export function admittedMask(
  mask: PsdLayerPixels['masks'][number] | undefined,
  document: { width: number; height: number } | undefined
) {
  if (!mask || !document) {
    return undefined;
  }

  if (mask.width && mask.height) {
    return mask;
  }

  if (document.width * document.height > 4_194_304) {
    return undefined;
  }

  return {
    ...mask,
    left: 0,
    top: 0,
    width: document.width,
    height: document.height,
    values: new Uint8Array(document.width * document.height).fill(mask.defaultColor)
  };
}
