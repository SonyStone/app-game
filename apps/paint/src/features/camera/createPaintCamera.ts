import { defaultCamera, transformAt, type Camera, type ViewSize } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createEffect, createSignal, latest, type Accessor } from 'solid-js';
import { createPaintNavigation } from './paintNavigation';

/**
 * Owns the editor camera: zoom, rotation, pan and mirroring of the view, never the document pixels. The camera
 * resets to `restored` whenever the engine loads a document and is otherwise changed by gestures and view controls.
 * The engine receives the camera and viewport size whenever it becomes ready and after every change.
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
  /** Includes changes made earlier in the current event, so consecutive gestures compose. */
  const current = () => latest(camera);
  const navigation = createPaintNavigation({
    size: options.size,
    camera: current,
    navigate: setCamera,
    viewport: () => options.bounds() ?? { left: 0, top: 0, ...options.size() }
  });

  createEffect(
    () => (options.ready() ? { camera: camera(), size: options.size() } : undefined),
    (view) => {
      if (view) {
        options.send({ type: 'view', ...view, dpr: devicePixelRatio });
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
