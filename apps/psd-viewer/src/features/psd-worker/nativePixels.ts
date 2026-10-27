import type { PsdNativeRegion, PsdRegionPixels, PsdRegionRect } from '@app-game/psd/viewer';

/** Reads original wire values in document coordinates, including packed Bitmap rows and IEEE float payloads. */
export function wireSample(region: PsdNativeRegion, id: number, x: number, y: number): number | undefined {
  const plane = region.planes.find((plane) => plane.id === id);
  if (!plane || x < plane.left || y < plane.top || x >= plane.left + plane.width || y >= plane.top + plane.height) {
    return undefined;
  }

  const column = x - plane.left;
  const row = y - plane.top;
  if (region.depth === 1) {
    return ((plane.bytes[row * Math.ceil(plane.width / 8) + Math.floor(column / 8)] ?? 0) >> (7 - (column % 8))) & 1;
  }

  const offset = ((row * plane.width + column) * region.depth) / 8;
  const view = new DataView(plane.bytes.buffer, plane.bytes.byteOffset, plane.bytes.byteLength);
  return region.depth === 32
    ? view.getFloat32(offset, false)
    : region.depth === 16
      ? view.getUint16(offset, false)
      : view.getUint8(offset);
}

/** Display conversion for bounded RGB/Gray wire reads only. Saved matte is intentionally retained and labeled. */
export function wireDisplay(region: PsdNativeRegion, rect: PsdRegionRect): PsdRegionPixels {
  if (![0, 1, 3].includes(region.mode)) {
    throw new Error(
      `Source display conversion is unsupported for color mode ${region.mode}; native planes remain available.`
    );
  }

  const pixels = new Uint8Array(rect.width * rect.height * 4);
  const maximum = region.depth === 16 ? 65535 : region.depth === 8 ? 255 : 1;
  const colorChannels = region.mode === 3 ? 3 : 1;
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const at = (y * rect.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let value = (wireSample(region, colorChannels === 3 ? c : 0, rect.left + x, rect.top + y) ?? 0) / maximum;
        if (region.depth === 32) {
          value = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
        }
        pixels[at + c] = Math.round(Math.max(0, Math.min(1, region.mode === 0 ? 1 - value : value)) * 255);
      }
      const alphaId = region.source === 'layerChannels' ? -1 : colorChannels;
      pixels[at + 3] = Math.round(
        Math.max(0, Math.min(1, (wireSample(region, alphaId, rect.left + x, rect.top + y) ?? maximum) / maximum)) * 255
      );
    }
  }

  return {
    ...rect,
    pixels,
    step: 1,
    strategy: 'window',
    source: region.source === 'savedComposite' ? 'savedComposite' : 'layers',
    exactToLayerRender: false,
    approximations: [
      region.source === 'savedComposite'
        ? 'Saved composite may be stale; original matte is retained.'
        : 'Original layer channels; masks and effects are not applied.'
    ]
  };
}

/** Bounds inspector work to one 256-square document window, centered on a requested sample when available. */
export function inspectionRect(
  size: { width: number; height: number },
  point?: { x: number; y: number }
): PsdRegionRect {
  const width = Math.min(256, size.width);
  const height = Math.min(256, size.height);
  return {
    left: Math.max(0, Math.min(size.width - width, Math.floor((point?.x ?? size.width / 2) - width / 2))),
    top: Math.max(0, Math.min(size.height - height, Math.floor((point?.y ?? size.height / 2) - height / 2))),
    width,
    height
  };
}
