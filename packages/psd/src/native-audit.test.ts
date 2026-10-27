import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openPsd, photoshopDefaultSettings, type PsdResult } from './viewer';

const root = process.env.PSD_TEXT_MIXER_RESEARCH_ROOT;
const fixtures = [
  'dribbble_psd__80488-e0f416fe634b-g0',
  'src__v1.1__v1.1_-_CS6__Source__Velositey.assets__Templates__footer-3ba97617090f-g0',
  'Fade_Out_3D_Text_Effect__Down-8f977f00cfbd-g0',
  'DSC_6218_2021-08-10-ca9f9e594715-g0'
];

/** The four former storage refusals must match strict full-native renders at edges and the center, both gammas. */
for (const fixture of fixtures) {
  it.skipIf(!root)(
    `matches strict native crops for ${fixture}`,
    async () => {
      const bytes = await readFile(`${root}/fixtures/psd/oracle-1/${fixture}/source-input/document.psd`);
      const doc = value(await openPsd(bytes));
      try {
        const { width, height } = doc.info;
        for (const linearBlending of [false, true]) {
          const options = {
            ...photoshopDefaultSettings,
            grayProfile: undefined,
            smartObjects: undefined,
            availableFonts: undefined,
            linearBlending,
            maxWorkPixels: width * height,
            budget: { allocationBytes: 512 * 1024 ** 2, liveBytes: 16 * 1024 ** 3, retainedBytes: bytes.length }
          };
          const full = value(doc.renderNativeRegion({ left: 0, top: 0, width, height }, options));
          for (const [left, top] of [
            [0, 0],
            [Math.floor(width / 2), Math.floor(height / 2)],
            [width - 31, height - 29]
          ]) {
            const rect = { left: left!, top: top!, width: 31, height: 29 };
            const boundedOptions = {
              ...options,
              maxWorkPixels: 4_194_304,
              budget: { ...options.budget, liveBytes: 2 * 1024 ** 3, allocationBytes: 64 * 1024 ** 2 }
            };
            expect(value(doc.regionCapability(rect, boundedOptions))).toMatchObject({
              strategy: 'window',
              refusal: null
            });
            const region = value(doc.renderNativeRegion(rect, boundedOptions));
            expect(region.strategy).toBe('window');
            expect(region.encoding).toBe(full.encoding);
            for (let row = 0; row < rect.height; row++) {
              const offset = ((rect.top + row) * width + rect.left) * full.channels;
              expect([
                ...region.samples.subarray(row * rect.width * full.channels, (row + 1) * rect.width * full.channels)
              ]).toEqual([...full.samples.subarray(offset, offset + rect.width * full.channels)]);
            }
          }
        }
      } finally {
        doc.close();
      }
    },
    120000
  );
}

function value<T>(result: PsdResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }
  return result.value;
}
