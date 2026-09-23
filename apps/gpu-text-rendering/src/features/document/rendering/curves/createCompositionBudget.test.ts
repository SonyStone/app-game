import { afterEach, expect, it, vi } from 'vitest';
import { createCompositionBudget } from './createCompositionBudget';

afterEach(() => vi.restoreAllMocks());

it('requires consecutive slow submissions, coalesces pending fences and resets on a fast sample', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  let finish!: () => void;
  const completed = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const changed = vi.fn();
  const budget = createCompositionBudget(completed, changed);

  const sample = async (duration: number) => {
    budget.observe([3]);
    budget.observe([9]);
    await flush();
    now += duration;
    finish();
    await flush();
  };

  await sample(12);
  expect(budget.has(3)).toBe(false);
  expect(completed).toHaveBeenCalledTimes(1);
  await sample(2);
  await sample(12);
  expect(budget.has(3)).toBe(false);
  await sample(12);
  expect(budget.has(3)).toBe(true);
  expect(budget.has(9)).toBe(false);
  expect(changed).toHaveBeenCalledTimes(1);
  budget.destroy();
});

it('ignores completion after disposal and handles device failures without invalidating', async () => {
  const changed = vi.fn();
  let finish!: () => void;
  const budget = createCompositionBudget(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    changed
  );
  budget.observe([1]);
  await flush();
  budget.destroy();
  finish();
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
