import { expect, it } from 'vitest';
import { commandBatch } from './commandBatch';

it('keeps resources alive until submission and releases each batch exactly once', () => {
  const order: string[] = [];
  const device = { createCommandEncoder: () => ({ finish: () => { order.push('finish'); return {}; } }),
    queue: { submit: () => { order.push('submit'); } } } as unknown as GPUDevice;
  const batch = commandBatch(device);
  batch.encoder();
  batch.afterSubmit(() => order.push('release first'));
  expect(order).toEqual([]);
  batch.flush();
  batch.flush();
  expect(order).toEqual(['finish', 'submit', 'release first']);
  expect(batch.version).toBe(1);
  batch.encoder();
  batch.afterSubmit(() => order.push('release second'));
  batch.flush();
  expect(order.slice(3)).toEqual(['finish', 'submit', 'release second']);
  expect(batch.version).toBe(2);
});
