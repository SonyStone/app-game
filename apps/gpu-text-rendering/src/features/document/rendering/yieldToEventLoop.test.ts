import { expect, it } from 'vitest';
import { yieldToEventLoop } from './yieldToEventLoop';

it('resolves concurrent yields in request order through one shared channel', async () => {
  const order: number[] = [];
  await Promise.all([1, 2, 3].map((value) => yieldToEventLoop().then(() => order.push(value))));
  expect(order).toEqual([1, 2, 3]);
});
