import { expect, it } from 'vitest';
import { createBrushResources } from './resources';

it('copies upload bytes once and lends the same decoded texture to multiple strokes', () => {
  const cache = createBrushResources();
  const input = tip('tip');
  cache.put(input);
  input.pixels.fill(0);
  const first = cache.open(),
    second = cache.open();
  expect(first.get('tip').pixels).toEqual(new Uint8Array([1, 2, 3, 4]));
  expect(first.get('tip')).toBe(second.get('tip'));
  expect(cache.stats().pinnedBytes).toBe(4);
  first.release();
  first.release();
  expect(cache.stats().pinnedBytes).toBe(4);
  second.release();
  expect(cache.stats().pinnedBytes).toBe(0);
  expect(() => first.get('tip')).toThrow('released');
});

it('evicts least recently used idle entries and protects active stroke resources', () => {
  const cache = createBrushResources({ maxBytes: 12 });
  for (const id of ['a', 'b', 'c']) cache.put(tip(id));
  const active = cache.open();
  active.get('a');
  expect(cache.put(tip('d'))).toEqual(['b']);
  expect(() => cache.delete('a')).toThrow('in use');
  expect(cache.put(tip('e'))).toEqual(['c']);
  active.release();
  expect(cache.put(tip('f'))).toEqual(['a']);
  expect(cache.stats()).toEqual({ bytes: 12, entries: 3, pinnedBytes: 0 });
});

it('leaves entries intact after oversized, malformed, duplicate and pinned-budget failures', () => {
  const cache = createBrushResources({ maxBytes: 8 });
  cache.put(tip('a'));
  cache.put(tip('b'));
  const held = cache.open();
  held.get('a');
  expect(() => cache.put({ ...tip('too-big'), width: 12, height: 1, pixels: new Uint8Array(12) })).toThrow('full');
  expect(() => cache.put({ ...tip('c'), width: 6, height: 1, pixels: new Uint8Array(6) })).toThrow('full');
  expect(() => cache.put({ ...tip('bad'), width: 3 })).toThrow('exactly');
  expect(() => cache.put(tip('a'))).toThrow('already exists');
  expect(held.get('b').pixels).toEqual(tip('b').pixels);
  expect(cache.stats()).toEqual({ bytes: 8, entries: 2, pinnedBytes: 8 });
  held.release();
});

it('bounds entry metadata too and invalidates scopes on disposal', () => {
  const cache = createBrushResources({ maxEntries: 1 });
  cache.put(tip('a'));
  expect(cache.put(tip('b'))).toEqual(['a']);
  const scope = cache.open();
  scope.get('b');
  cache.dispose();
  scope.release();
  expect(cache.stats()).toEqual({ bytes: 0, entries: 0, pinnedBytes: 0 });
  expect(() => scope.get('b')).toThrow('disposed');
  expect(() => cache.put(tip('c'))).toThrow('disposed');
});

function tip(id: string) {
  return { id, width: 2, height: 2, format: 'r8unorm' as const, pixels: new Uint8Array([1, 2, 3, 4]) };
}
