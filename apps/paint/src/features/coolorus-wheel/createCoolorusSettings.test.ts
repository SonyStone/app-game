// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createCoolorusSettings } from './createCoolorusSettings';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  localStorage.clear();
  vi.restoreAllMocks();
});

it('composes updates in one event and restores both preferences on reload', () => {
  const first = setup();
  first.update({ hues: 'rgb' });
  first.update({ lockLightness: true });
  flush();
  expect(first.settings()).toEqual({ hues: 'rgb', lockLightness: true });
  expect(setup().settings()).toEqual(first.settings());
});

it.each(['null', '{broken', '{"hues":"future","lockLightness":7}'])('tolerates invalid settings %s', (raw) => {
  localStorage.setItem('paint.coolorus', raw);
  expect(setup().settings()).toEqual({ hues: 'ryb', lockLightness: false });
});

it('keeps session preferences when storage fails', () => {
  const settings = setup();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  settings.update({ hues: 'rgb' });
  flush();
  expect(settings.settings().hues).toBe('rgb');
});

function setup() {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return createCoolorusSettings();
  });
}
