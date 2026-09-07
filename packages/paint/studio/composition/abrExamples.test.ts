import { AbrParser, readPatternIndex } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { viewerBrush } from '../brushLibrary/viewerBrush';

it('imports embedded example presets with their full dynamics and auxiliary resources', () => {
  const bytes = readFileSync('apps/abr-viewer/src/assets/examples/halftones_and_screentones.abr');
  const file = new AbrParser().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const brush = file.brushes.find((brush) => brush.name === "Kyle's Halftone - Circle Range Tiny")!;
  expect(brush).toBeDefined();
  const preset = viewerBrush({ ...brush, patternResources: readPatternIndex(file.rawPatternData!) } as Parameters<
    typeof viewerBrush
  >[0]);
  expect(preset.engine.settings.values.useTexture).toBe(true);
  expect(preset.flow).toBe(0.5);
  expect(preset.engine.settings.blendMode).toBe('Dslv');
  expect(preset.resources.length).toBeGreaterThan(1);
});
