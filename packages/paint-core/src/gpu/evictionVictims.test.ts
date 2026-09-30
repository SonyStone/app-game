import { expect, it } from 'vitest';
import { evictionVictims } from './evictionVictims';

it('never evicts tiles pinned by the undrawn render batch', () => {
  // Resident limit 4 with eviction groups of 3: the batch already loaded two tiles and needs a third.
  const cache = new Map([
    ['layer/0,0', { used: 1 }],
    ['layer/1,0', { used: 2 }],
    ['batch/0,0', { used: 3 }],
    ['batch/1,0', { used: 4 }]
  ]);

  const victims = evictionVictims(cache, 3, new Set(['batch/0,0', 'batch/1,0']));

  expect(victims.map(([id]) => id)).toEqual(['layer/0,0', 'layer/1,0']);
});

it('evicts least recently used tiles first without pins', () => {
  const cache = new Map([
    ['c', { used: 9 }],
    ['a', { used: 1 }],
    ['b', { used: 5 }]
  ]);

  expect(evictionVictims(cache, 2).map(([id]) => id)).toEqual(['a', 'b']);
});
