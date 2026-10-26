import { viewerPerformance } from '../telemetry/performance';
import type { View } from '../viewport/view';
import type { DisplayTile } from './displayTiles';

/** Last-resort display using bounded cached tile surfaces; the strict worker and document survive backend changes. */
export function makeCanvasDisplay() {
  const resident = new Map<symbol, { canvas: HTMLCanvasElement; left: number; top: number; bytes: number }>();
  const identities = new WeakMap<DisplayTile, symbol>();
  let tiles: readonly DisplayTile[] = [];
  let bytes = 0;
  let pattern: CanvasPattern | null = null;
  return {
    setTiles(next: readonly DisplayTile[]) {
      tiles = next;
    },
    draw(canvas: HTMLCanvasElement, view: View, width: number, height: number, dpr: number) {
      const start = performance.now();
      let pending = false;
      for (const tile of tiles) {
        if (resident.has(identity(tile))) {
          continue;
        }

        if (performance.now() - start > 2) {
          pending = true;
          break;
        }

        const entry = allocate(tile);
        resident.set(identity(tile), entry);
        bytes += entry.bytes;
        viewerPerformance.record('upload.texture', start, entry.bytes);
        viewerPerformance.record('upload', start, entry.bytes);
      }

      const active = new Set(tiles.map(identity));
      for (const [tile, entry] of resident) {
        if (bytes <= 64 * 1024 * 1024) {
          break;
        }

        if (!active.has(tile)) {
          bytes -= entry.bytes;
          resident.delete(tile);
          entry.canvas.width = entry.canvas.height = 0;
        }
      }

      const context = canvas.getContext('2d', { alpha: false })!;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      pattern ??= context.createPattern(checkerboard(), 'repeat')!;
      context.fillStyle = pattern;
      context.fillRect(0, 0, width / dpr, height / dpr);

      context.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.x * dpr, view.y * dpr);
      for (const tile of tiles) {
        const entry = resident.get(identity(tile));
        if (!entry) {
          continue;
        }

        resident.delete(identity(tile));
        resident.set(identity(tile), entry);
        context.save();
        context.beginPath();
        context.rect(tile.clip.left, tile.clip.top, tile.clip.width, tile.clip.height);
        context.clip();
        context.imageSmoothingEnabled = view.scale * dpr * tile.step < 1;
        // Replace the ancestor's pixels with the same screen-space checker before alpha compositing.
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = pattern;
        context.fillRect(0, 0, width / dpr, height / dpr);
        context.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.x * dpr, view.y * dpr);
        context.drawImage(
          entry.canvas,
          entry.left,
          entry.top,
          entry.canvas.width * tile.step,
          entry.canvas.height * tile.step
        );
        context.restore();
      }

      viewerPerformance.record('frame.prepare', start);
      viewerPerformance.record('canvas.backing.bytes.estimate', performance.now(), bytes + width * height * 4);
      return pending;
    },
    destroy() {
      for (const entry of resident.values()) {
        entry.canvas.width = entry.canvas.height = 0;
      }

      resident.clear();
      tiles = [];
      bytes = 0;
    }
  };

  function identity(tile: DisplayTile) {
    let key = identities.get(tile);
    if (!key) {
      key = Symbol();
      identities.set(tile, key);
    }

    return key;
  }
}

function allocate(tile: DisplayTile) {
  const { image, step, clip } = tile;
  const x = Math.max(0, Math.round((clip.left - tile.left) / step) - 1);
  const y = Math.max(0, Math.round((clip.top - tile.top) / step) - 1);
  const right = Math.min(image.width, Math.ceil((clip.left + clip.width - tile.left) / step) + 1);
  const bottom = Math.min(image.height, Math.ceil((clip.top + clip.height - tile.top) / step) + 1);
  const canvas = document.createElement('canvas');
  canvas.width = right - x;
  canvas.height = bottom - y;
  const pixels = new Uint8ClampedArray(
    image.pixels.buffer as ArrayBuffer,
    image.pixels.byteOffset,
    image.pixels.byteLength
  );
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(pixels, image.width, image.height), -x, -y, x, y, canvas.width, canvas.height);
  return { canvas, left: tile.left + x * step, top: tile.top + y * step, bytes: canvas.width * canvas.height * 4 };
}

function checkerboard() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#303030';
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = '#3c3c3c';
  context.fillRect(0, 0, 8, 8);
  context.fillRect(8, 8, 8, 8);
  return canvas;
}
