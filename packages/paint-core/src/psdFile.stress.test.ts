import { openPsd, type PsdResult } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { TILE_SIZE } from './brush';
import type { Layer } from './document';
import { writePsdFile } from './psdFile';
import { TILE_BYTES } from './tilePixels';

const requestedSize = Number(process.env.PSD_EXPORT_STRESS_SIZE);
const sizes = requestedSize ? [requestedSize] : [2048, 4096];

// Run 8192² separately with PSD_EXPORT_STRESS_SIZE=8192 to measure a fresh process's peak RSS.
it.each(sizes)('exports a dense %i-square canvas with bounded strict render scratch', async (size) => {
  const tile = denseTile();
  const tiles = new Map<string, Uint8Array>();
  for (let y = 0; y < size / TILE_SIZE; y++) {
    for (let x = 0; x < size / TILE_SIZE; x++) {
      tiles.set(`${x},${y}`, tile);
    }
  }

  const layers = [0, 1, 2].map((index): Layer => ({
    id: `dense-${index}`,
    name: `Dense ${index}`,
    opacity: 1,
    visible: true,
    blend: 'normal',
    tiles
  }));
  const start = performance.now();
  const blob = await writePsdFile(layers, async () => {
    throw new Error('All tiles are in memory.');
  });
  const seconds = (performance.now() - start) / 1000;
  const peakMiB = process.resourceUsage().maxRSS / 1024;
  process.stdout.write(`${JSON.stringify({ size, seconds, peakMiB, fileBytes: blob.size })}\n`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Three random RGB layers resist PackBits, exceeding 128 MiB of source storage already at 4096².
  if (size >= 4096) {
    expect(await openPsd(bytes)).toMatchObject({ ok: false, error: { kind: 'budget' } });
  }

  const document = value(await openPsd(bytes, {
    allocationBytes: Math.max(128 * 1024 * 1024, bytes.byteLength),
    liveBytes: bytes.byteLength * 4 + size * size * 4 + 512 * 1024 * 1024
  }));
  try {
    expect(document.info).toMatchObject({ width: size, height: size, layerRecords: 3 });
    // Sample the saved composite with row streaming, including both sides of composite tile boundaries.
    for (const step of [1023, 1024]) {
      const saved = value(document.savedOverview(step, 0, { liveBytes: bytes.byteLength * 4 + 512 * 1024 * 1024 }));
      for (let y = 0; y < saved.height; y++) {
        for (let x = 0; x < saved.width; x++) {
          const offset = (((y * step) % TILE_SIZE) * TILE_SIZE + (x * step) % TILE_SIZE) * 4;
          expect(saved.pixels.subarray((y * saved.width + x) * 4, (y * saved.width + x + 1) * 4)).toEqual(
            tile.subarray(offset, offset + 4)
          );
        }
      }
    }
  } finally {
    document.close();
  }
}, 120_000);

/** Dense, opaque, reproducible noise avoids a misleadingly tiny solid-color source file. */
function denseTile(): Uint8Array {
  const tile = new Uint8Array(TILE_BYTES);
  let state = 123456789;
  for (let i = 0; i < tile.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      tile[i + channel] = state & 255;
    }

    tile[i + 3] = 255;
  }

  return tile;
}

/** Surfaces the viewer's typed diagnostic in a failing stress assertion. */
function value<T>(result: PsdResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
