// @vitest-environment jsdom
import { createRoot } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import type { Camera } from './createCanvasCamera';
import { counterTransform, createViewportPopups } from './createViewportPopups';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('shows a point placed at window coordinates there, unscaled, whatever the camera', () => {
  const camera = { x: 100, y: 50, zoom: 2 };
  const at = { left: 300, top: 200 };
  const origin = { x: 40, y: 10 };
  const { translate, scale } = counterTransform(camera, at, origin);
  const [x, y] = translate.split(' ').map(parseFloat) as [number, number];
  const s = Number(scale);

  // The box's top left corner: at + origin + translate + scale·(0 − origin), then through the camera.
  const screenX = camera.x + camera.zoom * (at.left + origin.x + x - s * origin.x);
  const screenY = camera.y + camera.zoom * (at.top + origin.y + y - s * origin.y);
  expect(screenX).toBeCloseTo(300);
  expect(screenY).toBeCloseTo(200);
  expect(s * camera.zoom).toBeCloseTo(1);
});

it('counter-transforms fixed popups that appear in the world, and follows the camera', async () => {
  const world = document.createElement('div');
  world.innerHTML = `
    <div id="screen" data-canvas-screen><div id="framed" style="position: fixed; left: 10px; top: 10px"></div></div>
    <div data-variant-screen><div id="variant" style="position: fixed; left: 10px; top: 10px"></div></div>
    <div id="menu" popover style="position: fixed; left: 10px; top: 10px"></div>`;
  document.body.append(world);
  let camera: Camera = { x: 100, y: 50, zoom: 2 };
  let popups!: ReturnType<typeof createViewportPopups>;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    popups = createViewportPopups({ world: () => world, camera: () => camera });
  });
  await Promise.resolve();

  const popup = document.createElement('div');
  popup.style.cssText = 'position: fixed; left: 300px; top: 200px';
  const inline = document.createElement('div');
  world.append(popup, inline);
  await Promise.resolve();

  expect(popup.style.translate).toBe('-200px -125px');
  expect(popup.style.scale).toBe('0.5');
  expect(inline.style.translate).toBe('');
  expect(document.getElementById('framed')!.style.translate).toBe('');
  expect(document.getElementById('variant')!.style.translate).toBe('');
  expect(document.getElementById('menu')!.style.translate).toBe('');

  camera = { x: 0, y: 0, zoom: 1 };
  popups.update();
  expect(popup.style.translate).toBe('0px 0px');
  expect(popup.style.scale).toBe('1');

  // A popup that moves itself is placed again.
  popup.style.left = '500px';
  await Promise.resolve();
  camera = { x: -100, y: 0, zoom: 1 };
  popups.update();
  expect(popup.style.translate).toBe('100px 0px');
});
