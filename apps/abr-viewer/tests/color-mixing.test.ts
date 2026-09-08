import { describe, expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { generateComputedBrushTip, type PreviewInput } from '../src/features/brush-preview/stroke';

/** Pixel expectations are independent of the shared shader: equal red/green is 188 in linear light, 128 in sRGB. */
function input(type = 'PbTl', mode = 'Nrml'): PreviewInput {
  const values = brushToFormValues({
    id: 'mix',
    name: 'Mix',
    type: 'computed',
    settings: {},
    diameter: 32,
    hardness: 100,
    spacing: 10
  });
  Object.assign(values.tool, { type, mode });
  return {
    values,
    width: 64,
    height: 64,
    dpr: 1,
    color: '#ff0000',
    background: '#00ff00',
    flow: 1,
    opacity: 0.5,
    path: [{ x: 0.5, y: 0.5, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }]
  };
}
const tip = generateComputedBrushTip(32, 100);
function center(job: PreviewInput) {
  return Array.from(renderPreviewPixels(job, tip).slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4));
}
describe('ABR color mixing', () => {
  test.each(['PbTl', 'PcTl'])('%s switches working space without changing coverage or preset settings', (tool) => {
    const job = input(tool);
    const saved = structuredClone(job.values);
    expect(center(job)).toEqual([128, 128, 0, 255]);
    expect(center({ ...job, colorMixing: 'linear' })).toEqual([188, 188, 0, 255]);
    expect(center({ ...job, colorMixing: 'linear', color: '#00ff00', background: '#ff0000' })).toEqual([
      188, 188, 0, 255
    ]);
    expect(center({ ...job, colorMixing: 'classic' })).toEqual([128, 128, 0, 255]);
    expect(job.values).toEqual(saved);
  });
  test.each(['Mltp', 'Scrn', 'Ovrl', 'Cler', 'Bhnd', 'Dslv'])('%s keeps its paint mode', (mode) => {
    const job = input('PbTl', mode);
    expect(renderPreviewPixels({ ...job, colorMixing: 'linear' }, tip)).toEqual(renderPreviewPixels(job, tip));
  });
  test('eraser retains transparent coverage instead of mixing white paint', () => {
    const job = input('ErTl');
    expect(renderPreviewPixels({ ...job, colorMixing: 'linear' }, tip)).toEqual(renderPreviewPixels(job, tip));
  });
});
