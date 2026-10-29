import { openPsd } from '@app-game/psd/viewer';
import { readFile } from 'node:fs/promises';
import { createRoot, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { createLayerVisibility } from '../src/features/layers/createLayerVisibility';
import { contentBounds, filteredRows, layerRows } from '../src/features/layers/layerTree';
import { playbackDelay, stepState } from '../src/features/states/playback';

it('searches 350 records, preserves ancestors, and solos/restores without mutating saved visibility', async () => {
  const opened = await openPsd(
    await readFile(new URL('../src/features/examples/assets/pass-through-groups.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  try {
    const group = opened.value.layers.find((node) => node.children)!;
    const child = group.children![0]!;
    const nodes = [
      {
        ...group,
        children: Array.from({ length: 350 }, (_, i) => ({
          ...child,
          bounds: { left: 1, top: 2, right: 30, bottom: 40 },
          children: undefined,
          index: 1000 + i,
          name: `Record ${i}`
        }))
      }
    ];
    const saved = JSON.stringify(nodes);
    expect(layerRows(nodes)).toHaveLength(351);
    expect(filteredRows(nodes, new Set([group.index]), 'Record 349').map(({ node }) => node.name)).toEqual([
      group.name,
      'Record 349'
    ]);
    expect(filteredRows(nodes, new Set([group.index]), '')).toHaveLength(1);
    expect(contentBounds(nodes)).toBeDefined();
    const { visibility, dispose } = createRoot((dispose) => ({ visibility: createLayerVisibility(() => 1), dispose }));
    visibility.solo(nodes, 1349);
    flush();
    expect(visibility.overrides().get(group.index)).toBe(true);
    expect(visibility.overrides().get(1349)).toBe(true);
    expect(visibility.overrides().get(1348)).toBe(false);
    visibility.restoreSaved();
    flush();
    expect(visibility.pairs()).toEqual([]);
    dispose();
    expect(JSON.stringify(nodes)).toBe(saved);
  } finally {
    opened.value.close();
  }
});

it('steps frames/comps by persistent ID, clamps or loops, and bounds animation delays', () => {
  const states = {
    comps: [
      { id: 7, name: 'A' },
      { id: 99, name: 'B' }
    ],
    frames: [
      { id: 3, delay: 0 },
      { id: 42, delay: 3000 }
    ],
    activeFrame: null,
    lastAppliedComp: null,
    errors: []
  };
  expect(stepState(states, null, 1, false)).toEqual({ frame: 3 });
  expect(stepState(states, { frame: 42 }, 1, false)).toEqual({ frame: 42 });
  expect(stepState(states, { frame: 42 }, 1, true)).toEqual({ frame: 3 });
  expect(stepState(states, { comp: 99 }, -1, false)).toEqual({ comp: 7 });
  expect(playbackDelay(states, { frame: 3 })).toBe(100);
  expect(playbackDelay(states, { frame: 42 })).toBe(10000);
});
