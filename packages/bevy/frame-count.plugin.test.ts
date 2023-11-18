import { expect, it } from 'vitest';
import { App } from './app';
import { FrameCount, frameCountPlugin } from './frame-count.plugin';

it('frame counter update', () => {
  const app = new App().addPlugin(frameCountPlugin);
  app.update();

  const frameCount = app.world.resources(FrameCount);

  expect(frameCount).toBe(1);
});
