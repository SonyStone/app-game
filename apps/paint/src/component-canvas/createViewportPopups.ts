import { createEffect, onCleanup } from 'solid-js';
import type { Camera } from './createCanvasCamera';

/**
 * Keeps the popups of components on the canvas where the components mean them to be. Paint's components place some
 * popups, such as the value grid of `ValueButton`, with `position: fixed` at window coordinates taken from the pointer
 * or from `getBoundingClientRect`. On the canvas the world element is transformed, which makes it their containing
 * block: such a popup would land shifted by the camera and scaled by its zoom, away from where its hit tests look.
 *
 * Every fixed element in the world placed with `left` and `top` gets a counter-transform (the `translate` and `scale`
 * properties, which compose with the element's own `transform`), so that it shows at those window coordinates at
 * 100 %, as a portal would put it in Paint. Moving the camera calls `update`. Left alone: popovers and modal dialogs,
 * which the top layer already shows in window coordinates, and everything inside `data-canvas-screen`, a frame that
 * stands in for the window. Must be created within a Solid owner.
 */
export function createViewportPopups(options: { world: () => HTMLElement | undefined; camera: () => Camera }) {
  const tracked = new Set<HTMLElement>();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLElement && tracked.has(record.target)) {
          place(record.target);
        }

        continue;
      }

      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) {
          for (const element of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
            place(element);
          }
        }
      }
    }

    for (const element of tracked) {
      if (!element.isConnected) {
        tracked.delete(element);
      }
    }
  });
  createEffect(options.world, (world) => {
    if (!world) {
      return;
    }

    observer.observe(world, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  });
  onCleanup(() => tracked.clear());

  return {
    /** Places the popups again for the camera now; call it whenever the camera is drawn. */
    update() {
      for (const element of tracked) {
        place(element);
      }
    }
  };

  /**
   * Counter-transforms `element` if it is a fixed popup, and forgets it otherwise. Writes only changed values: the
   * observer sees the element's own style writes, and an unchanged pass ends the loop that its own writes start.
   */
  function place(element: HTMLElement) {
    if (element.hasAttribute('popover') || element.closest('[data-canvas-screen]')) {
      return;
    }

    const style = getComputedStyle(element);
    const left = parseFloat(style.left);
    const top = parseFloat(style.top);
    if (style.position !== 'fixed' || element.matches('dialog:modal') || !Number.isFinite(left + top)) {
      if (tracked.delete(element)) {
        element.style.removeProperty('translate');
        element.style.removeProperty('scale');
      }

      return;
    }

    tracked.add(element);
    // Browsers resolve the origin to pixels; percentages are of the box.
    const [originX = 0, originY = 0] = style.transformOrigin
      .split(' ')
      .map((value, axis) =>
        value.endsWith('%')
          ? (parseFloat(value) / 100) * (axis === 0 ? element.offsetWidth : element.offsetHeight)
          : parseFloat(value) || 0
      );
    const { translate, scale } = counterTransform(options.camera(), { left, top }, { x: originX, y: originY });
    if (element.style.translate !== translate) {
      element.style.translate = translate;
    }

    if (element.style.scale !== scale) {
      element.style.scale = scale;
    }
  }
}

/**
 * The `translate` and `scale` that show an element placed at `at` (its `left` and `top`, relative to the world) at
 * those coordinates of the window, unscaled, although the world is drawn at `camera`. `origin` is the element's
 * transform origin relative to its box, around which `scale` applies.
 */
export function counterTransform(
  camera: Camera,
  at: { left: number; top: number },
  origin: { x: number; y: number }
) {
  const scale = 1 / camera.zoom;
  // A box point p lands in the world at at + origin + translate + scale·(p − origin), and on screen at
  // camera + zoom·that.
  const x = (at.left - camera.x) / camera.zoom - at.left - origin.x * (1 - scale);
  const y = (at.top - camera.y) / camera.zoom - at.top - origin.y * (1 - scale);
  return { translate: `${round(x)}px ${round(y)}px`, scale: `${round(scale)}` };
}

/** Rounds away binary noise, so that an unchanged camera writes identical values. */
function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
