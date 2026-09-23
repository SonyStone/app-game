import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { SceneFrame } from '../createFrame';
import { mipTail, reduceMip, tilePixels } from './rasterPixels';
import { imageTiles, packMipTails, tileAddress, tileExtent, visibleImage } from './virtualTiles';

describe('virtual texture addressing', () => {
  it('packs every mip tail within a bounded atlas even for ten thousand large images', () => {
    const table = new DataView(new ArrayBuffer(10000 * 24));

    for (let i = 0; i < 10000; i++) {
      table.setUint32(i * 24, 4096, true);
      table.setUint32(i * 24 + 4, 8192, true);
    }

    const packed = packMipTails(table);
    expect(packed.images).toHaveLength(10000);
    expect(packed.width * packed.height * 4).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(
      packed.images.every(
        (image) => image.x + image.tailWidth <= packed.width && image.y + image.tailHeight <= packed.height
      )
    ).toBe(true);
  });

  it('uses neighboring source pixels on both sides of tile boundaries', () => {
    const pixels = new Uint8Array(257 * 3 * 4);

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 257; x++) {
        pixels.set([x % 256, y, 0, 255], (y * 257 + x) * 4);
      }
    }

    const mip = { width: 257, height: 3, pixels };
    const left = new Uint8Array(tilePixels(mip, 0, 0));
    const right = new Uint8Array(tilePixels(mip, 1, 0));
    expect([...left.subarray((tileExtent + 128) * 4, (tileExtent + 130) * 4)]).toEqual([
      ...right.subarray(tileExtent * 4, (tileExtent + 2) * 4)
    ]);
    expect([...left.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
  });

  it('reduces odd dimensions and keeps every terminal level for small images', async () => {
    const source = { width: 3, height: 1, pixels: new Uint8Array([0, 0, 0, 255, 30, 0, 0, 255, 60, 0, 0, 255]) };
    const reduced = reduceMip(source);
    expect([...reduced.pixels]).toEqual([30, 0, 0, 255]);
    const tail = (await mipTail(3, 1, 0, async (level) => ok(level === 0 ? source : reduced)))._unsafeUnwrap();
    expect(tail.width).toBe(8);
    expect(tail.height).toBe(3);
  });

  it('culls offscreen images and maps a rotated viewport back into source UV coordinates', () => {
    const data = new DataView(new ArrayBuffer(80));
    data.setFloat32(0, 1, true);
    data.setFloat32(12, 1, true);
    const frame: SceneFrame = {
      width: 800,
      height: 800,
      mul: [4, 4],
      add: [-2, -2],
      rotation: [0, 1, -1, 0],
      visible: [],
      vectorOnly: false,
      grids: false
    };
    const visible = visibleImage(data, 0, frame)!;
    expect([visible.left, visible.right, visible.top, visible.bottom]).toEqual([0.25, 0.75, 0.25, 0.75]);
    expect(visibleImage(data, 0, { ...frame, add: [10, 10] })).toBeUndefined();
  });
});

it('packs a color-ramp tail wider than one physical tile without wrapping rows', async () => {
  const result = await mipTail(512, 1, 0, async (level) => {
    const width = Math.max(1, 512 >> level);
    const pixels = new Uint8Array(width * 4);

    for (let x = 0; x < width; x++) {
      pixels.set([x % 256, 0, 0, 255], x * 4);
    }

    return ok({ width, height: 1, pixels });
  });
  const tail = result._unsafeUnwrap();
  const pixels = new Uint8Array(tail.pixels);

  for (const x of [0, 127, 128, 255, 511]) {
    expect([...pixels.slice((tail.width + x + 1) * 4, (tail.width + x + 2) * 4)]).toEqual([x % 256, 0, 0, 255]);
  }
});

it('keeps wide-image columns distinct from the next tile row and mip level', () => {
  const addresses = [
    { image: 0, level: 0, x: 128, y: 0 },
    { image: 0, level: 0, x: 0, y: 1 },
    { image: 0, level: 0, x: 511, y: 511 },
    { image: 0, level: 1, x: 0, y: 0 }
  ].map(tileAddress);
  expect(new Set(addresses).size).toBe(addresses.length);
});

it('does not stream a color ramp because its constant one-texel axis is stretched', () => {
  const table = new DataView(new ArrayBuffer(2 * 24));
  table.setUint32(0, 4096, true);
  table.setUint32(4, 1, true);
  table.setUint32(24, 1, true);
  table.setUint32(28, 4096, true);
  const [horizontal, vertical] = packMipTails(table).images;
  const region = { left: 0, right: 1, top: 0, bottom: 1, width: 128, height: 2048, distance: 0 };

  expect(imageTiles(horizontal!, region)).toEqual([]);
  expect(imageTiles(vertical!, { ...region, width: 2048, height: 16 })).toEqual([]);
  expect(imageTiles(horizontal!, { ...region, width: 4096 }).some((tile) => tile.level === 0)).toBe(true);
});
