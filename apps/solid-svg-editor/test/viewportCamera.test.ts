import { createRoot, createSignal, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../src/editor/defaults';
import { createViewportCamera } from '../src/features/viewport/createViewportCamera';
import type { SvgSize } from '../src/features/viewport/viewport-math';

describe('createViewportCamera', () => {
  it('frames the document until the user moves the camera, then keeps the camera on resize', () => {
    const { camera, setRootSize } = createRoot(() => {
      const [rootSize, setRootSize] = createSignal<SvgSize>({ width: 100, height: 100, viewBox: [0, 0, 100, 100] });
      const camera = createViewportCamera({ rootSize, settings: defaultSettings, canvasSvg: () => undefined });
      return { camera, setRootSize };
    });

    camera.setViewportSize({ width: 1000, height: 500 });
    flush();

    expect(camera.zoom()).toBeCloseTo(4.3);
    expect(camera.cameraCenter()).toEqual({ x: 50, y: 50 });

    camera.setZoom(2);
    camera.setViewportRotation(1);
    camera.setCameraCenter({ x: 10, y: 20 });
    flush();
    camera.setViewportSize({ width: 600, height: 400 });
    setRootSize({ width: 50, height: 50, viewBox: [0, 0, 50, 50] });
    flush();

    expect([camera.zoom(), camera.viewportRotation(), camera.cameraCenter()]).toEqual([2, 1, { x: 10, y: 20 }]);

    camera.centerFrame();
    flush();

    expect([camera.zoom(), camera.viewportRotation(), camera.cameraCenter()]).toEqual([6.88, 0, { x: 25, y: 25 }]);
  });
});
