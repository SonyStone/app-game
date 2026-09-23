import { expect, it, vi } from 'vitest';
import { createPageBundles } from './pageBundles';

it('reuses pan commands and replaces the bundle after a shader-selection band changes', () => {
  const paint = vi.fn();
  const finish = vi.fn(() => ({}) as GPURenderBundle);
  const create = vi.fn(() => ({ finish }) as unknown as GPURenderBundleEncoder);
  let dispose = () => {};
  const bundles = createPageBundles(
    { createRenderBundleEncoder: create } as unknown as GPUDevice,
    'rgba8unorm',
    [[{ first: 0, count: 1, image: undefined, blend: 0 }]],
    (resource) => {
      dispose = () => resource.destroy();
      return resource;
    }
  );
  const first = bundles(0, paint, 'small');

  expect(bundles(0, paint, 'small')).toBe(first);
  expect(create).toHaveBeenCalledTimes(1);
  expect(bundles(0, paint, 'large')).not.toBe(first);
  expect(create).toHaveBeenCalledTimes(2);
  expect(paint).toHaveBeenCalledTimes(2);

  dispose();
  bundles(0, paint, 'large');
  expect(create).toHaveBeenCalledTimes(3);
});
