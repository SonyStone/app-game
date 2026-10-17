// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createInfiniteColorSettings, defaultInfiniteColorSettings } from './createInfiniteColorSettings';

afterEach(() => localStorage.clear());

it('starts from the defaults and keeps changes across instances', () => {
  const first = setup();
  expect(first.settings()).toEqual(defaultInfiniteColorSettings);

  first.update({ tab: 'orb', toneLock: true });
  first.update({ orb: { ...first.settings().orb, contrast: 0.8 } });
  expect(first.settings().tab).toBe('orb');
  const second = setup().settings();
  expect(second.tab).toBe('orb');
  expect(second.toneLock).toBe(true);
  expect(second.orb.contrast).toBe(0.8);
});

it('falls back to the default for each broken stored value', () => {
  localStorage.setItem(
    'paint.infinite.color',
    JSON.stringify({
      tab: 'nope',
      model: 'lab',
      compareTone: 'yes',
      palette: 99,
      orb: { base: 'red', light: '#112233', contrast: 3, picker: { x: 2, y: 2 }, selected: 'base' }
    })
  );
  const { settings } = setup();
  expect(settings().tab).toBe('wheel');
  expect(settings().model).toBe('lab');
  expect(settings().compareTone).toBe(false);
  expect(settings().palette).toBe(0);
  expect(settings().orb).toEqual({ ...defaultInfiniteColorSettings.orb, light: '#112233', selected: 'base' });

  localStorage.setItem('paint.infinite.color', '{broken');
  expect(setup().settings()).toEqual(defaultInfiniteColorSettings);
});

function setup() {
  return createRoot(() => createInfiniteColorSettings());
}
