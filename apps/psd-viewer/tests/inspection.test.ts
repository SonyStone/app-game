import type { PsdSavedProcessChannels } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { admittedMask, channelImage, displayPixel, maskImage, nativeSample } from '../src/features/inspection/pixels';

it('reads big-endian wire16 and float32 saved native values without RGB8 loss', () => {
  const channels: PsdSavedProcessChannels = {
    width: 2,
    height: 1,
    mode: 3,
    depth: 16,
    planes: [{ index: 0, role: 'process', bytes: Uint8Array.of(0x12, 0x34, 0xff, 0xff), visible: null }],
    colorModeData: new Uint8Array(),
    resources: [],
    metadataError: null,
    source: 'saved'
  };
  expect(nativeSample(channels, 0, 0, 0)).toBe(0x1234);
  expect(nativeSample(channels, 0, 1, 0)).toBe(65535);
  expect(nativeSample(channels, 0, 2, 0)).toBeUndefined();
  expect(channelImage(channels, 0).pixels).toEqual(Uint8Array.of(18, 18, 18, 255, 255, 255, 255, 255));
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat32(0, 0.125, false);
  expect(nativeSample({ ...channels, depth: 32, planes: [{ ...channels.planes[0]!, bytes }] }, 0, 0, 0)).toBe(0.125);
});

it('samples the finest resident coverage and reports gaps instead of invented pixels', () => {
  const image = { width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4), window: { left: 10, top: 20, step: 2 } };
  expect(displayPixel(image, 11, 21)).toEqual({ rgba: [1, 2, 3, 4], step: 2 });
  expect(displayPixel(image, 0, 0)).toBeUndefined();
});

it('shows constant saved masks within admission and preserves their source values', () => {
  const mask = {
    id: -2,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    values: new Uint8Array(),
    defaultColor: 255,
    disabled: false
  };
  const admitted = admittedMask(mask, { width: 2, height: 1 })!;
  expect(maskImage(admitted).pixels).toEqual(new Uint8Array(8).fill(255));
  expect(maskImage(admitted, true).pixels[3]).toBe(0);
  expect(mask.values.length).toBe(0);
  expect(admittedMask(mask, { width: 10000, height: 10000 })).toBeUndefined();
});
