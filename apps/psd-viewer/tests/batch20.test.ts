import { createHash } from 'node:crypto';
import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { readableSaveItem } from '../src/features/editing/saveNote';
import { createRenderSettings } from '../src/features/render-settings/createRenderSettings';
import { displayColor, usesConfiguredDisplay } from '../src/features/render-settings/displayColor';
import { createGrayProfile } from '../src/features/render-settings/grayProfile';
import { presentationNotice } from '../src/features/status/presentationNotice';

it('keeps the measured stroke opt-in across reset and document preferences', () => {
  const { settings, dispose } = createRoot((dispose) => ({ settings: createRenderSettings(), dispose }));
  try {
    expect(settings.settings().approximateOneSidedStrokes).toBe(true);
    settings.replace({ ...settings.settings(), approximateOneSidedStrokes: false });
    expect(settings.settings().approximateOneSidedStrokes).toBe(true);
    settings.reset();
    expect(settings.settings().approximateOneSidedStrokes).toBe(true);
  } finally {
    dispose();
  }
});

it('uses generated Gray and no bundled CMYK working space', async () => {
  const color = await displayColor();
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  expect(color.dither).toBe(false);
  expect(hash(color.srgb)).toBe('3f6d674174f3804eb0dabdac90ae17486e898c5063a66f861c116ea033da8301');
  expect(color.workingCmyk).toBeUndefined();
  expect(color.workingGray).toEqual(createGrayProfile());
  expect(hash(color.workingGray!.subarray(color.workingGray!.length - 524))).toBe(
    '5ae9f8a85da210a457e1232fb8a27cec4e898da88335766432a2ad04d28ac993'
  );
  expect([1, 3, 4, 8, 9].filter(usesConfiguredDisplay)).toEqual([4, 8, 9]);
});

it('explains presentation and stroke limitations and preserves unfamiliar diagnostics', () => {
  expect(presentationNotice('DisplayConversion: legacy RGB16')).toContain('16-bit RGB');
  expect(presentationNotice('DisplayConversion: legacy 32-bit')).toContain('HDR');
  expect(presentationNotice('DisplayConversion: legacy Gray')).toContain('Dot Gain');
  expect(presentationNotice('a one-sided vector stroke approximated by clipping')).toContain('inside or outside');
  expect(presentationNotice('Other diagnostic')).toBe('Other diagnostic');
});

it('names itemized save resources while retaining unknown IDs and all actions', () => {
  expect(readableSaveItem('resource 1060: dropped')).toBe('XMP metadata [resource 1060]: dropped');
  expect(readableSaveItem('source resource 1039')).toBe('source ICC profile [resource 1039]');
  expect(readableSaveItem('resource 65500: added')).toBe('resource 65500: added');
  expect(readableSaveItem('document global layer mask rewritten')).toBe('document global layer mask rewritten');
});
