import { expect, it, vi } from 'vitest';
import { createBrushResources } from '@app-game/abr-paint/resources';
import type { BrushSession } from '@app-game/paint-core/composition/contracts';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';

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

it.each(['finish', 'cancel', 'add', 'preview', 'idle'] as const)(
  'releases resources after %s, including failed operations',
  async (operation) => {
    const cache = createBrushResources();
    cache.put(tip('a'));
    const engine = session();
    if (operation === 'add') engine.add.mockRejectedValue(new Error('add failed'));
    if (operation === 'idle') engine.idle.mockRejectedValue(new Error('idle failed'));
    if (operation === 'preview')
      engine.preview.mockImplementation(() => {
        throw new Error('preview failed');
      });
    const stroke = createResourceSession(cache, (resources) => {
      resources.get('a');
      return engine;
    });
    if (operation === 'add') await expect(stroke.add([])).rejects.toThrow('add failed');
    if (operation === 'idle') await expect(stroke.idle!(16)).rejects.toThrow('idle failed');
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
    idle: vi.fn<NonNullable<BrushSession['idle']>>(async () => false),
    add: vi.fn<BrushSession['add']>(async () => {}),
    preview: vi.fn<BrushSession['preview']>(),
    finish: vi.fn<BrushSession['finish']>(async () => []),
    cancel: vi.fn<BrushSession['cancel']>()
  };
}
