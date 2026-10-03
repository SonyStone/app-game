// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createRecentColors } from './createRecentColors';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('restores distinct normalized colors and skips invalid entries', () => {
  localStorage.setItem('paint.recentColors', JSON.stringify(['#FFF', '#ffffff', 'nope', 7, '#123456']));
  expect(setup().colors()).toEqual(['#ffffff', '#123456']);

  localStorage.setItem('paint.recentColors', '{broken');
  expect(setup().colors()).toEqual([]);
});

it('moves a color to the front, keeps at most twelve and survives storage failures', () => {
  const recents = setup();
  for (let index = 0; index < 13; index++) {
    recents.remember(`#0000${index.toString(16).padStart(2, '0')}`);
  }

  recents.remember('#000005');
  flush();
  expect(recents.colors()).toHaveLength(12);
  expect(recents.colors()[0]).toBe('#000005');
  expect(recents.colors()).not.toContain('#000000');
  expect(JSON.parse(localStorage.getItem('paint.recentColors')!)).toEqual(recents.colors());

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  recents.remember('#ffffff');
  flush();
  expect(recents.colors()[0]).toBe('#ffffff');
});

function setup() {
  return createRoot(() => createRecentColors());
}
