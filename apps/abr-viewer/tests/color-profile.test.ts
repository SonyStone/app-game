import { createEffect, createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createColorProfile } from '../src/features/brush-detail/createColorProfile';

it('publishes replacement profiles reactively, retains the prior profile on failure, and cleans up', async () => {
  const a = profile('a'),
    b = profile('b');
  const load = vi
    .fn()
    .mockResolvedValueOnce(a)
    .mockRejectedValueOnce(new Error('Invalid ICC'))
    .mockResolvedValueOnce(b);
  let dispose!: () => void;
  const seen: (string | undefined)[] = [];
  const state = createRoot((stop) => {
    dispose = stop;
    const state = createColorProfile(load);
    createEffect(
      () => state.profile()?.name,
      (name) => {
        seen.push(name);
      }
    );
    return state;
  });
  flush();
  try {
    await state.select(file());
    flush();
    expect(state.converter()).toBe(a.convert);
    expect(state.profile()?.name).toBe('a');
    await state.select(file());
    flush();
    expect(state.error()).toBe('Invalid ICC');
    expect(state.profile()).toBe(a);
    expect(a.dispose).not.toHaveBeenCalled();
    await state.select(file());
    flush();
    expect(state.error()).toBe('');
    expect(state.profile()).toBe(b);
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(seen).toEqual([undefined, 'a', 'b']);
    state.clear();
    flush();
    expect(state.profile()).toBeUndefined();
    expect(b.dispose).toHaveBeenCalledOnce();
  } finally {
    dispose();
  }
  expect(b.dispose).toHaveBeenCalledOnce();
});

it('disposes late transforms after replacement, clear, or owner disposal', async () => {
  const pending: ((value: ReturnType<typeof profile>) => void)[] = [];
  const load = () => new Promise<ReturnType<typeof profile>>((resolve) => pending.push(resolve));
  let dispose!: () => void;
  const state = createRoot((stop) => {
    dispose = stop;
    return createColorProfile(load);
  });
  const first = state.select(file());
  await Promise.resolve();
  const second = state.select(file());
  await Promise.resolve();
  const a = profile('old'),
    b = profile('new'),
    c = profile('cleared'),
    d = profile('disposed');
  pending[1]!(b);
  await second;
  pending[0]!(a);
  await first;
  flush();
  expect(state.profile()).toBe(b);
  expect(a.dispose).toHaveBeenCalledOnce();
  const third = state.select(file());
  await Promise.resolve();
  state.clear();
  pending[2]!(c);
  await third;
  flush();
  expect(state.profile()).toBeUndefined();
  expect(b.dispose).toHaveBeenCalledOnce();
  expect(c.dispose).toHaveBeenCalledOnce();
  const fourth = state.select(file());
  await Promise.resolve();
  dispose();
  pending[3]!(d);
  await fourth;
  expect(d.dispose).toHaveBeenCalledOnce();
});

it('bounds file input before loading WASM', async () => {
  const load = vi.fn();
  let dispose!: () => void;
  const state = createRoot((stop) => {
    dispose = stop;
    return createColorProfile(load);
  });
  const arrayBuffer = vi.fn();
  try {
    await state.select({ size: 17 * 1024 * 1024, arrayBuffer });
    flush();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(state.error()).toContain('16 MiB');
    expect(state.loading()).toBe(false);
  } finally {
    dispose();
  }
});
function file() {
  return { size: 128, arrayBuffer: async () => new ArrayBuffer(128) };
}
function profile(name: string) {
  return { name, convert: () => [12, 34, 56] as const, dispose: vi.fn() };
}
