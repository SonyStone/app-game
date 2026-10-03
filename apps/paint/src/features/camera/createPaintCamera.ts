import { defaultCamera, transformAt, type Camera, type ViewSize } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { makeMediaQueryListener } from '@solid-primitives/media';
import { createEffect, createSignal, latest, type Accessor } from 'solid-js';
import { createPaintNavigation } from './paintNavigation';

/**
 * Owns the editor camera: zoom, rotation, pan and mirroring of the view, never the document pixels. The camera
 * resets to `restored` whenever the engine loads a document and is otherwise changed by gestures and view controls.
 * The engine receives the camera, viewport size and device pixel ratio whenever it becomes ready and after every
 * change, including a window moving to a display with another pixel ratio.
 * Must be created within a Solid owner.
 */
export function createPaintCamera(options: {
  /** Camera stored with the loaded document; the default camera until one is reported. */
  restored: Accessor<Camera | undefined>;
  /** Canvas size in CSS pixels. */
  size: Accessor<ViewSize>;
  /** Whether the engine accepts view commands. */
  ready: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'view' }>) => void;
  /** Client-space bounds of the canvas, which offset puck gestures. */
  bounds: () => { left: number; top: number; width: number; height: number } | undefined;
}) {
  const [camera, setCamera] = createSignal<Camera>((previous) => options.restored() ?? previous ?? defaultCamera());
  /** The camera for gesture handlers; like `camera`, it shows a write only after the flush that carries it. */
  const current = () => latest(camera);
  const navigation = createPaintNavigation({
    size: options.size,
    camera: current,
    navigate: setCamera,
    viewport: () => options.bounds() ?? { left: 0, top: 0, ...options.size() }
  });

  const dpr = createDevicePixelRatio();

  createEffect(
    () => (options.ready() ? { camera: camera(), size: options.size(), dpr: dpr() } : undefined),
    (view) => {
      if (view) {
        options.send({ type: 'view', ...view });
      }
    }
  );

  return {
    camera,
    current,
    /** Navigation puck controller, sharing this camera. */
    navigation,
    /** Replaces the camera; used by pointer and touch gestures. */
    navigate: (next: Camera) => setCamera(next),
    /** Zooms around the viewport center by `factor`. */
    zoomBy(factor: number) {
      zoomTo(current().zoom * factor);
    },
    /** Returns to 100% zoom around the viewport center. */
    resetZoom() {
      zoomTo(1);
    },
    resetRotation() {
      setCamera({ ...current(), angle: 0 });
    },
    toggleMirror() {
      const view = current();
      setCamera({ ...view, mirrored: !view.mirrored });
    },
    /** Returns to the document origin at 100%, unrotated and unmirrored. */
    reset() {
      setCamera(defaultCamera());
    }
  };

  function zoomTo(zoom: number) {
    const size = options.size();
    setCamera(transformAt(current(), size, { x: size.width / 2, y: size.height / 2 }, zoom));
  }
}

/** `devicePixelRatio`, updated when the window moves to another display or the browser zoom changes. */
function createDevicePixelRatio() {
  const [ratio, setRatio] = createSignal(devicePixelRatio);
  // A resolution query matches only the current ratio, so each change re-arms the listener for the new one.
  createEffect(ratio, (current) =>
    makeMediaQueryListener(`(resolution: ${current}dppx)`, () => setRatio(devicePixelRatio))
  );
  return ratio;
}
