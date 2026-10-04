// @vitest-environment jsdom
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createRecentPresets } from './createRecentPresets';

afterEach(() => {
  localStorage.clear();
});

it('lists the most recently used presets other than the current one, skipping deleted ones', () => {
  const deleted = new Set<string>();
  const { recents, use, dispose } = setup(deleted);
  for (const id of ['a', 'b', 'c', 'b', 'd']) {
    use(id);
  }

  expect(recents.recent(3)).toEqual(['b', 'c', 'a']);
  expect(recents.recent(1)).toEqual(['b']);
  deleted.add('c');
  use('a');
  expect(recents.recent(3)).toEqual(['d', 'b']);
  dispose();

  // A new editor restores the list; until it reports a current preset, every remembered one is listed.
  const restored = setup(deleted);
  expect(restored.recents.recent(3)).toEqual(['a', 'd', 'b']);
  restored.dispose();
});

it('starts empty when storage holds something else', () => {
  localStorage.setItem('paint.recentPresets', '{broken');
  const { recents, dispose } = setup(new Set());
  expect(recents.recent(3)).toEqual([]);
  dispose();
});

function setup(deleted: ReadonlySet<string>) {
  return createRoot((dispose) => {
    const [current, setCurrent] = createSignal<string>();
    const recents = createRecentPresets({ current, exists: (id) => !deleted.has(id) });
    return {
      recents,
      dispose,
      use(id: string) {
        setCurrent(id);
        flush();
      }
    };
  });
}
