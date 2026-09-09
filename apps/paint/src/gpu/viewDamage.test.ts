import { expect, it } from 'vitest';
import { defaultCamera } from '../camera';
import { createViewDamage } from './viewDamage';

const size = { width: 1024, height: 1024 };
const camera = defaultCamera();
const plan = (damage: ReturnType<typeof createViewDamage>, signature = 'view') =>
  damage.plan(signature, camera, size, size);

it('consumes changes independently for each view and skips unchanged presentation', () => {
  const a = createViewDamage(),
    b = createViewDamage();
  for (const view of [a, b]) view.presented(plan(view));
  for (const view of [a, b]) view.mark('0,0');
  const partial = plan(a);
  expect(partial.full).toBe(false);
  expect(partial.region!.width * partial.region!.height).toBeLessThan(1024 ** 2);
  a.presented(partial);
  expect(plan(a).region).toBeUndefined();
  expect(plan(b).region).toEqual(partial.region);
});

it('retains refinement or newer tile changes that arrive while an earlier frame is waiting', () => {
  const view = createViewDamage();
  view.presented(plan(view));
  view.mark('0,0');
  const old = plan(view);
  view.mark('-1,-1');
  view.presented(old);
  expect(plan(view).region!.width).toBeGreaterThan(old.region!.width!);
  const pending = plan(view);
  view.invalidate();
  view.presented(pending);
  expect(plan(view).full).toBe(true);
});

it('acknowledges offscreen changes and rebuilds when that camera later moves', () => {
  const view = createViewDamage();
  view.presented(plan(view));
  view.mark('100,100');
  const offscreen = plan(view);
  expect(offscreen.region).toBeUndefined();
  view.presented(offscreen);
  expect(plan(view).region).toBeUndefined();
  expect(plan(view, 'new-camera').full).toBe(true);
});

it('bounds dormant-view bookkeeping and keeps full invalidation until successful presentation', () => {
  const view = createViewDamage(2);
  view.presented(plan(view));
  for (const key of ['0,0', '1,0', '2,0']) view.mark(key);
  expect(plan(view).full).toBe(true);
  view.presented(plan(view));
  expect(plan(view).region).toBeUndefined();
});
