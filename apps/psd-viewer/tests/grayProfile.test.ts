import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createGrayProfile } from '../src/features/render-settings/grayProfile';

import { grayRamp } from './grayFixtures';

it('generates the Dot Gain 20% curve from its formula', () => {
  const bytes = createGrayProfile();
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'f45efa5dcc28302290d20e00e54867b150a9f58761ba33edaa2d0da07850f5c8'
  );
  expect(
    createHash('sha256')
      .update(bytes.subarray(bytes.length - 524))
      .digest('hex')
  ).toBe('5ae9f8a85da210a457e1232fb8a27cec4e898da88335766432a2ad04d28ac993');
});

for (const depth of [8, 16] as const) {
  it(`converts a complete Gray${depth} ramp using the generated ICC`, async () => {
    const result = await openPsd(grayRamp(depth));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    try {
      const srgb = await readFile(new URL('../src/features/render-settings/profiles/srgb.icc', import.meta.url));
      const converted = result.value.renderSrgb(photoshopDefaultSettings, {
        srgb,
        workingGray: createGrayProfile(),
        dither: false
      });
      expect(converted.ok).toBe(true);
      if (converted.ok) {
        const expected =
          depth === 8
            ? 'bd430c28803709608efa69f4b5bfa9c5b7af1cb8561ec35b85179b791219bc89'
            : 'a7f85a7791173d7c3e3a1a6b6ef9ec800e27b83f97c5a1a5954a7f4241378b81';
        // Recorded from the local pre-removal comparison, without retaining the old ICC bytes.
        expect(createHash('sha256').update(converted.value.rgba8).digest('hex')).toBe(expected);
        expect(converted.value.rgba8.slice(0, 4)).toEqual(Uint8Array.of(0, 0, 0, 255));
        expect(Math.min(...converted.value.rgba8.slice(-4))).toBeGreaterThanOrEqual(254);
      }
    } finally {
      result.value.close();
    }
  });
}
