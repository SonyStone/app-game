import { expect, it } from 'vitest';
import { attempt, createTaskQueue, unwrapResult } from './asyncResult';

it('starts browser/GPU operations synchronously and returns a typed success', async () => {
  let started = false;
  const result = attempt(() => {
    started = true;
    return 42;
  });
  expect(started).toBe(true);
  expect(await result).toEqual({ ok: true, value: 42 });
});

it('preserves Error identity and normalizes non-Error throws with their cause', async () => {
  const failure = new Error('Device lost');
  expect(await attempt(() => Promise.reject(failure))).toEqual({ ok: false, error: failure });
  const result = await attempt(() => {
    throw 'permission denied';
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.cause).toBe('permission denied');
    expect(result.error.message).toBe('permission denied');
    expect(() => unwrapResult(result)).toThrow(result.error);
  }
});

it('serializes tasks, keeps failure visible, and lets the next task succeed', async () => {
  const queue = createTaskQueue();
  const order: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failure = new Error('Disk full');
  const first = queue.run(async () => {
    order.push(1);
    await gate;
    throw failure;
  });
  const snapshot = queue.drain();
  const second = queue.run(() => {
    order.push(2);
    return 'saved';
  });
  await Promise.resolve();
  expect(order).toEqual([1]);
  release();
  expect(await first).toEqual({ ok: false, error: failure });
  expect(await snapshot).toEqual({ ok: false, error: failure });
  expect(await second).toEqual({ ok: true, value: 'saved' });
  expect(await queue.drain()).toEqual({ ok: true, value: 'saved' });
  expect(order).toEqual([1, 2]);
});
