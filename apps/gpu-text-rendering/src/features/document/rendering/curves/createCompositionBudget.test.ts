import { expect, it, vi } from 'vitest';
import { createCompositionBudget } from './createCompositionBudget';

it('requires consecutive slow frames, coalesces pending costs, skips unmeasured frames and resets on a fast one', async () => {
  let finish!: (cost: number | undefined) => void;
  const cost = vi.fn(
    () =>
      new Promise<number | undefined>((resolve) => {
        finish = resolve;
      })
  );
  const changed = vi.fn();
  const budget = createCompositionBudget(cost, changed);

  const sample = async (ms: number | undefined) => {
    budget.observe([3]);
    budget.observe([9]);
    await flush();
    finish(ms);
    await flush();
  };

  await sample(12);
  expect(budget.has(3)).toBe(false);
  expect(cost).toHaveBeenCalledTimes(1);
  await sample(2);
  await sample(12);
  // A frame without a meaningful cost neither counts nor resets.
  await sample(undefined);
  expect(budget.has(3)).toBe(false);
  await sample(12);
  expect(budget.has(3)).toBe(true);
  expect(budget.has(9)).toBe(false);
  expect(changed).toHaveBeenCalledTimes(1);
  budget.destroy();
});

it('judges frames by the given threshold', async () => {
  const budget = createCompositionBudget(async () => 12, vi.fn(), 13);

  for (let i = 0; i < 3; i++) {
    budget.observe([1]);
    await flush();
  }

  expect(budget.has(1)).toBe(false);
  budget.destroy();
});

it('ignores completion after disposal and handles device failures without invalidating', async () => {
  const changed = vi.fn();
  let finish!: (cost: number) => void;
  const budget = createCompositionBudget(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    changed
  );
  budget.observe([1]);
  await flush();
  budget.destroy();
  finish(100);
  await flush();
  expect(budget.size).toBe(0);
  expect(changed).not.toHaveBeenCalled();

  const failed = createCompositionBudget(() => Promise.reject(new Error('device lost')), changed);
  failed.observe([1]);
  await flush();
  failed.observe([1]);
  await flush();
  expect(failed.size).toBe(0);
  expect(changed).not.toHaveBeenCalled();
  failed.destroy();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
