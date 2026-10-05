import { defaultBrush } from '@app-game/paint-core/brush';
import { expect, it } from 'vitest';
import { clearAbrBrush } from './clearAbrBrush';

it('erases with the Clear paint mode, keeps Eraser Tool presets and refuses pickup tools', () => {
  const paintbrush = abrBrush('PbTl');
  expect(clearAbrBrush(paintbrush)?.engine).toEqual({
    id: 'abr',
    settings: { tipId: 'tip', blendMode: 'Cler', values: { tool: { type: 'PbTl' } } }
  });
  expect(paintbrush.engine?.settings).toMatchObject({ blendMode: 'Nrml' });

  const eraser = abrBrush('ErTl');
  expect(clearAbrBrush(eraser)).toBe(eraser);
  for (const type of ['MixB', 'SmTl', 'BlTl', 'ShTl']) {
    expect(clearAbrBrush(abrBrush(type))).toBeUndefined();
  }
});

function abrBrush(type: string) {
  return {
    ...defaultBrush(),
    engine: { id: 'abr', settings: { tipId: 'tip', blendMode: 'Nrml', values: { tool: { type } } } }
  };
}
