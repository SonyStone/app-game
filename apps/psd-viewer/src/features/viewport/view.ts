/** Scale and offset of an image in its viewport: image pixel `p` shows at `p · scale + (x, y)`. */
export type View = { scale: number; x: number; y: number };

/** The view that shows all of `image` centered in `viewport` with a margin, magnifying small images. */
export function fitView(viewport: { width: number; height: number }, image: { width: number; height: number }): View {
  const available = {
    width: Math.max(viewport.width - 2 * margin, 1),
    height: Math.max(viewport.height - 2 * margin, 1)
  };
  const scale = clampScale(
    Math.min(available.width / Math.max(image.width, 1), available.height / Math.max(image.height, 1))
  );
  return { scale, x: (viewport.width - image.width * scale) / 2, y: (viewport.height - image.height * scale) / 2 };
}

/** `view` zoomed by `factor` about `point` in viewport pixels, which stays over the same image pixel. */
export function zoomView(view: View, factor: number, point: { x: number; y: number }): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/** `view` moved by `delta` viewport pixels. */
export function panView(view: View, delta: { x: number; y: number }): View {
  return { scale: view.scale, x: view.x + delta.x, y: view.y + delta.y };
}

/** Zoom limits: 1/64 to 6400%. */
export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 1 / 64), 64);
}

/** Space kept around a fitted image, in viewport pixels. */
const margin = 24;
