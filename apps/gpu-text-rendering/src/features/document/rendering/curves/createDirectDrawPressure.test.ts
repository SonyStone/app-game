import { expect, it, vi } from 'vitest';
import { createDirectDrawPressure } from './createDirectDrawPressure';

it('turns constrained after two consecutive slow frames, resetting on a fast one and skipping unmeasured ones', async () => {
  let finish!: (cost: number | undefined) => void;
  const cost = vi.fn(
    () =>
      new Promise<number | undefined>((resolve) => {
        finish = resolve;
      })
  );
  const changed = vi.fn();
  const pressure = createDirectDrawPressure(cost, changed);

  const sample = async (ms: number | undefined) => {
    pressure.observe();
    pressure.observe();
    await flush();
    finish(ms);
    await flush();
  };

  await sample(40);
  expect(cost).toHaveBeenCalledTimes(1);
  await sample(5);
  await sample(40);
  await sample(undefined);
  expect(pressure.constrained).toBe(false);
  await sample(40);
  expect(pressure.constrained).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);

  pressure.observe();
  expect(cost).toHaveBeenCalledTimes(5);
  pressure.destroy();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
