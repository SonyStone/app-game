import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../src/editor/defaults';
import { createViewportCamera } from '../src/features/viewport/createViewportCamera';
import type { ViewportRendererAdapter } from '../src/features/viewport/rendererAdapter';

describe('createViewportCamera', () => {
  it('projects client points through the renderer viewport rect', () => {
    createRoot((dispose) => {
      let rectReads = 0;
      const renderer = createViewportRectRenderer(clientRect({ left: 10, top: 20, right: 210, bottom: 120 }), () => {
        rectReads += 1;
      });
      const camera = createViewportCamera({
        rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
        settings: () => defaultSettings(),
        renderer
      });

      camera.setCameraCenter({ x: 100, y: 200 });
      camera.setZoom(2);

      expect(camera.clientToSvgPoint(110, 70, false)).toEqual({ x: 100, y: 200 });
      expect(camera.clientToSvgPoint(130, 90, false)).toEqual({ x: 110, y: 210 });
      expect(rectReads).toBe(2);
      dispose();
    });
  });

  it('computes viewport-center angles through the renderer viewport rect', () => {
    createRoot((dispose) => {
      const renderer = createViewportRectRenderer(clientRect({ left: 10, top: 20, right: 210, bottom: 120 }));
      const camera = createViewportCamera({
        rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
        settings: () => defaultSettings(),
        renderer
      });

      expect(camera.angleFromViewportCenter(210, 70)).toBeCloseTo(0);
      expect(camera.angleFromViewportCenter(110, 120)).toBeCloseTo(Math.PI / 2);
      dispose();
    });
  });

  it('falls back to stable camera math when no viewport rect is available', () => {
    createRoot((dispose) => {
      const camera = createViewportCamera({
        rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
        settings: () => defaultSettings(),
        renderer: createViewportRectRenderer(undefined)
      });

      camera.setCameraCenter({ x: 15, y: 25 });
      camera.setZoom(3);

      expect(camera.clientToSvgPoint(999, 888, false)).toEqual({ x: 15, y: 25 });
      expect(camera.angleFromViewportCenter(999, 888)).toBe(0);
      dispose();
    });
  });
});

function createViewportRectRenderer(
  rect: DOMRectReadOnly | undefined,
  onRead: () => void = () => undefined
): Pick<ViewportRendererAdapter, 'viewportClientRect'> {
  return {
    viewportClientRect: () => {
      onRead();
      return rect;
    }
  };
}

function clientRect(values: {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}): DOMRectReadOnly {
  const rect = {
    x: values.left,
    y: values.top,
    width: values.right - values.left,
    height: values.bottom - values.top,
    top: values.top,
    right: values.right,
    bottom: values.bottom,
    left: values.left,
    toJSON: () => values
  } satisfies DOMRectReadOnly;

  return rect;
}
