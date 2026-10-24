import type { MapPoint, TankiMap } from '../map/format';
import { editableRings, findItem, hasClosedRings, selectionBounds, type VertexRef } from './edits';
import { worldToScreen, type MapView, type ScreenSize } from './view';

/**
 * Handles the select tool shows around the selection, in canvas CSS pixels: corners of the one
 * selected outline, the midpoints of its edges where a drag inserts a corner, and the knob above
 * the selection that turns it. Drawing and pointer hit tests both use this list.
 */
export function selectionHandles(map: TankiMap, selection: readonly string[], view: MapView, screen: ScreenSize) {
  const bounds = selectionBounds(map, selection);
  const single = selection.length === 1 ? findItem(map, selection[0]) : undefined;
  const vertices: { ref: VertexRef; at: MapPoint }[] = [];
  const midpoints: { ref: VertexRef; at: MapPoint; world: MapPoint }[] = [];

  if (single) {
    const closed = hasClosedRings(single);

    editableRings(single).forEach((ring, ringIndex) => {
      ring.forEach((corner, index) => {
        vertices.push({ ref: { id: single.id, ring: ringIndex, index }, at: worldToScreen(view, screen, corner) });

        const next = ring[index + 1] ?? (closed ? ring[0] : undefined);

        if (!next) {
          return;
        }

        const world = { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
        const at = worldToScreen(view, screen, world);
        const length = Math.hypot(next.x - corner.x, next.y - corner.y) * view.zoom;

        if (length >= MIN_EDGE_FOR_MIDPOINT) {
          midpoints.push({ ref: { id: single.id, ring: ringIndex, index: index + 1 }, at, world });
        }
      });
    });
  }

  const rotate = bounds
    ? (() => {
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const top = worldToScreen(view, screen, { x: center.x, y: bounds.y });

        return { center, anchor: top, at: { x: top.x, y: top.y - ROTATE_KNOB_DISTANCE } };
      })()
    : undefined;

  return { vertices, midpoints, rotate };
}

/** Handles of one selection, as {@link selectionHandles} lays them out. */
export type SelectionHandles = ReturnType<typeof selectionHandles>;

/** Size of a corner handle in CSS pixels; clicks count within this distance of a handle. */
export const HANDLE_SIZE = 8;

/** Distance from the top of the selection to the rotation knob, in CSS pixels. */
const ROTATE_KNOB_DISTANCE = 28;

/** Edges shorter than this on screen get no midpoint handle, so handles do not pile up. */
const MIN_EDGE_FOR_MIDPOINT = 24;
