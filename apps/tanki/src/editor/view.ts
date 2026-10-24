import type { MapBounds, MapPoint } from '../map/format';

/**
 * The editor's view of the map: the world point at the middle of the canvas and the zoom in
 * screen pixels per world pixel. The editor never turns the view, so north stays up.
 */
export type MapView = { x: number; y: number; zoom: number };

/** Size of the canvas in CSS pixels. */
export type ScreenSize = { width: number; height: number };

/** Converts a point in canvas CSS pixels to world pixels. */
export function screenToWorld(view: MapView, screen: ScreenSize, point: MapPoint): MapPoint {
  return {
    x: view.x + (point.x - screen.width / 2) / view.zoom,
    y: view.y + (point.y - screen.height / 2) / view.zoom
  };
}

/** Converts a point in world pixels to canvas CSS pixels. */
export function worldToScreen(view: MapView, screen: ScreenSize, point: MapPoint): MapPoint {
  return {
    x: (point.x - view.x) * view.zoom + screen.width / 2,
    y: (point.y - view.y) * view.zoom + screen.height / 2
  };
}

/**
 * Zooms by `factor` keeping the world point under `anchor` (canvas CSS pixels) in place, within
 * {@link MIN_ZOOM} and {@link MAX_ZOOM}.
 */
export function zoomAt(view: MapView, screen: ScreenSize, anchor: MapPoint, factor: number): MapView {
  const zoom = Math.min(Math.max(view.zoom * factor, MIN_ZOOM), MAX_ZOOM);
  const before = screenToWorld(view, screen, anchor);
  const after = screenToWorld({ ...view, zoom }, screen, anchor);

  return { x: view.x + before.x - after.x, y: view.y + before.y - after.y, zoom };
}

/** Moves the view so the map slides by `delta` canvas CSS pixels. */
export function panBy(view: MapView, delta: MapPoint): MapView {
  return { ...view, x: view.x - delta.x / view.zoom, y: view.y - delta.y / view.zoom };
}

/** A view that shows all of `bounds` with a margin of `padding` CSS pixels. */
export function fitView(bounds: MapBounds, screen: ScreenSize, padding = 48): MapView {
  const zoom = Math.min(
    (screen.width - padding * 2) / Math.max(bounds.width, 1),
    (screen.height - padding * 2) / Math.max(bounds.height, 1)
  );

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    zoom: Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM)
  };
}

/** Farthest out the editor zooms: a 10 km map still fits on a laptop screen. */
export const MIN_ZOOM = 0.05;

/** Farthest in: a tank fills a phone screen. */
export const MAX_ZOOM = 8;
