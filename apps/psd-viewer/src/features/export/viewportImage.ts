import type { PsdImage } from '@app-game/psd/viewer';
import { displayTileLevels, displayTiles, type DisplayImage } from '../gpu-viewport/displayTiles';
import type { View } from '../viewport/view';

/** Assembles only the requested export viewport, never a document-sized surface for tiled renders. Checkerboard and UI are excluded; transparency is retained. */
export function viewportImage(
  image: DisplayImage,
  view: View,
  size: { width: number; height: number },
  saved?: { image: PsdImage; divider: number },
  mask?: DisplayImage
): PsdImage {
  if (displayTiles(image).some((tile) => tile.gpu)) {
    throw new Error('Wait for strict CPU tiles before exporting the GPU preview.');
  }

  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  if (width * height > 16_777_216) {
    throw new Error('Viewport export exceeds the 16 million pixel limit.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  draw(context, image, view);
  if (saved) {
    context.save();
    context.beginPath();
    context.rect((width * saved.divider) / 100, 0, width, height);
    context.clip();
    context.clearRect(0, 0, width, height);
    draw(context, saved.image, view);
    context.restore();
  }

  if (mask) {
    draw(context, mask, view);
  }

  return { width, height, pixels: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer) };
}

/** Uses finest available LOD per coverage and the viewport's premultiplied browser sampling. */
function draw(context: CanvasRenderingContext2D, image: DisplayImage, view: View) {
  context.imageSmoothingEnabled = view.scale < 1;
  const sources = new Map<PsdImage, HTMLCanvasElement>();
  for (const { requested: tile } of displayTileLevels(displayTiles(image), Math.max(1, 1 / view.scale))) {
    if (
      view.x + (tile.clip.left + tile.clip.width) * view.scale <= 0 ||
      view.y + (tile.clip.top + tile.clip.height) * view.scale <= 0 ||
      view.x + tile.clip.left * view.scale >= context.canvas.width ||
      view.y + tile.clip.top * view.scale >= context.canvas.height
    ) {
      continue;
    }

    let source = sources.get(tile.image);
    if (!source) {
      source = document.createElement('canvas');
      source.width = tile.image.width;
      source.height = tile.image.height;
      source
        .getContext('2d')!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(
              tile.image.pixels.buffer as ArrayBuffer,
              tile.image.pixels.byteOffset,
              tile.image.pixels.byteLength
            ),
            source.width,
            source.height
          ),
          0,
          0
        );
      sources.set(tile.image, source);
    }

    const { clip, step } = tile;
    const x = (clip.left - tile.left) / step;
    const y = (clip.top - tile.top) / step;
    context.drawImage(
      source,
      x,
      y,
      clip.width / step,
      clip.height / step,
      view.x + clip.left * view.scale,
      view.y + clip.top * view.scale,
      clip.width * view.scale,
      clip.height * view.scale
    );
  }

  for (const source of sources.values()) {
    source.width = 0;
    source.height = 0;
  }
}
