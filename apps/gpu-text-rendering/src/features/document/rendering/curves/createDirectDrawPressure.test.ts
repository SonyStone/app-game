import { afterEach, expect, it, vi } from 'vitest';
import { createDirectDrawPressure } from './createDirectDrawPressure';

afterEach(() => vi.restoreAllMocks());

it('turns constrained after two consecutive slow frames, resetting on a fast one', async () => {
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
  const pressure = createDirectDrawPressure(completed, changed);

  const sample = async (duration: number) => {
    pressure.observe();
    pressure.observe();
    await flush();
    now += duration;
    finish();
    await flush();
  };

  await sample(40);
  expect(completed).toHaveBeenCalledTimes(1);
  await sample(5);
  await sample(40);
  expect(pressure.constrained).toBe(false);
  await sample(40);
  expect(pressure.constrained).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);

  pressure.observe();
  expect(completed).toHaveBeenCalledTimes(4);
  pressure.destroy();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
