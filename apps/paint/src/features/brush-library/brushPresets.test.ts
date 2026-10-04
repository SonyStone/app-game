import { defaultBrush } from '@app-game/paint-core/brush';
import { expect, it } from 'vitest';
import { applyPreset, presetChanges, presetSettings, type BrushPreset } from './brushPresets';

it('saves the chosen groups and always the tip', () => {
  const brush = { ...defaultBrush(), size: 80, color: '#ff0000', engine: { id: 'textured', settings: { tipId: 't' } } };
  expect(presetSettings(brush, ['size'])).toEqual({
    engine: brush.engine,
    tool: 'brush',
    hardness: brush.hardness,
    spacing: brush.spacing,
    size: 80
  });
  expect(presetSettings(brush, ['color'])).toMatchObject({ color: '#ff0000' });
  expect(presetSettings(brush, ['color'])).not.toHaveProperty('backgroundColor');
});

it('applies included groups over the current brush, keeping skipped keys and the rest', () => {
  const preset = inkPreset();
  const current = { ...defaultBrush(), size: 12, opacity: 0.3, engine: { id: 'other', settings: {} } };
  const applied = applyPreset(current, preset, { flow: 0.9 }, ['size']);
  expect(applied).toMatchObject({ size: 12, opacity: 0.3, flow: 0.9, hardness: 1, tool: 'brush' });
  expect(applied.engine).toBeUndefined();
  expect(applyPreset(current, preset).size).toBe(40);
});

it('reports changes only for included, editable settings', () => {
  const preset = inkPreset();
  const brush = applyPreset(defaultBrush(), preset);
  expect(presetChanges(preset, brush)).toEqual({});
  const changed = {
    ...brush,
    size: 50,
    opacity: 0.2,
    stroke: { ...brush.stroke, smooth: 30 },
    tool: 'eraser' as const
  };
  // Opacity and stroke settings are not part of this preset; the tool identifies the tip.
  expect(presetChanges(preset, changed)).toEqual({ size: 50 });
  expect(presetChanges(preset, changed, ['size'])).toEqual({});
});

function inkPreset(): BrushPreset {
  return {
    id: 'ink',
    name: 'Ink',
    settings: { tool: 'brush', hardness: 1, spacing: 0.05, size: 40, flow: 1 },
    resourceIds: []
  };
}
