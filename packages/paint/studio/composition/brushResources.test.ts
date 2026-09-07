import { expect, it, vi } from 'vitest';
import { createBrushResources } from './brushResources';
import type { BrushSession } from './contracts';
import { createResourceSession } from './resourceSession';

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

it('releases resources when engine creation fails partway through resolving dependencies', () => {
  const cache = createBrushResources();
  cache.put(tip('a'));
  expect(() =>
    createResourceSession(cache, (resources) => {
      resources.get('a');
      resources.get('missing');
      return session();
    })
  ).toThrow('not loaded');
  expect(cache.stats().pinnedBytes).toBe(0);
});

it.each(['finish', 'cancel', 'add', 'preview'] as const)(
  'releases resources after %s, including failed operations',
  async (operation) => {
    const cache = createBrushResources();
    cache.put(tip('a'));
    const engine = session();
    if (operation === 'add') engine.add.mockRejectedValue(new Error('add failed'));
    if (operation === 'preview')
      engine.preview.mockImplementation(() => {
        throw new Error('preview failed');
      });
    const stroke = createResourceSession(cache, (resources) => {
      resources.get('a');
      return engine;
    });
    if (operation === 'add') await expect(stroke.add([])).rejects.toThrow('add failed');
    if (operation === 'preview') expect(() => stroke.preview(true)).toThrow('preview failed');
    if (operation === 'finish') await stroke.finish();
    if (operation === 'cancel') stroke.cancel();
    stroke.cancel();
    expect(engine.cancel).toHaveBeenCalledTimes(operation === 'finish' ? 0 : 1);
    expect(cache.stats().pinnedBytes).toBe(0);
    await expect(stroke.add([])).rejects.toThrow('closed');
  }
);

it('rejects late finish results after cancellation during readback', async () => {
  const cache = createBrushResources();
  cache.put(tip('a'));
  let complete!: (changes: Awaited<ReturnType<BrushSession['finish']>>) => void;
  const engine = session();
  engine.finish.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const stroke = createResourceSession(cache, (resources) => {
    resources.get('a');
    return engine;
  });
  const pending = stroke.finish();
  stroke.cancel();
  complete([]);
  await expect(pending).rejects.toThrow('closed');
  expect(cache.stats().pinnedBytes).toBe(0);
  expect(engine.cancel).toHaveBeenCalledOnce();
});

it('retains both finish and cancellation errors while releasing pins', async () => {
  const cache = createBrushResources();
  cache.put(tip('a'));
  const engine = session();
  const finishError = new Error('finish failed'),
    cancelError = new Error('cancel failed');
  engine.finish.mockRejectedValue(finishError);
  engine.cancel.mockImplementation(() => {
    throw cancelError;
  });
  const stroke = createResourceSession(cache, (resources) => {
    resources.get('a');
    return engine;
  });
  await expect(stroke.finish()).rejects.toMatchObject({ errors: [finishError, cancelError] });
  expect(cache.stats().pinnedBytes).toBe(0);
  stroke.cancel();
  expect(engine.cancel).toHaveBeenCalledOnce();
});

function tip(id: string) {
  return { id, width: 2, height: 2, format: 'r8unorm' as const, pixels: new Uint8Array([1, 2, 3, 4]) };
}
function session() {
  return {
    add: vi.fn<BrushSession['add']>(async () => {}),
    preview: vi.fn<BrushSession['preview']>(),
    finish: vi.fn<BrushSession['finish']>(async () => []),
    cancel: vi.fn<BrushSession['cancel']>()
  };
}
