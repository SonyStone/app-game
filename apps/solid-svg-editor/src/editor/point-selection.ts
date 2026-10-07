/** A polygon's or polyline's points, as `parsePoints` reads them. */
export type PointList = readonly (readonly [number, number])[];

/** The edited points and the point indices to select afterwards. */
export type PointsEdit = { readonly points: PointList; readonly indices: readonly number[] };

/**
 * Which of GodSVG's point actions apply to selected points: inserting after a single point, "Set as initial" for a
 * polygon of two or more points (unavailable when the first point is selected), and "Reverse order" for a polyline
 * whose points are all selected.
 */
export function pointSelectionActions(
  name: string,
  count: number,
  indices: readonly number[]
): { readonly insertAfter: boolean; readonly setOrigin: boolean; readonly setOriginEnabled: boolean; readonly reverse: boolean } {
  const selected = new Set(indices);
  return {
    insertAfter: indices.length === 1,
    setOrigin: name === 'polygon' && count >= 2 && indices.length === 1,
    setOriginEnabled: indices[0] !== 0,
    reverse: name === 'polyline' && count >= 2 && Array.from({ length: count }, (_, index) => index).every((index) => selected.has(index))
  };
}

/** Inserts `count` points at the origin after `index`, like GodSVG, and selects the last one. */
export function insertPointsAfter(points: PointList, index: number, count: number): PointsEdit {
  const added = Array.from({ length: count }, () => [0, 0] as const);
  return { points: [...points.slice(0, index + 1), ...added, ...points.slice(index + 1)], indices: [index + count] };
}

/** Makes the point at `index` the polygon's first, keeping the shape (a polygon is closed). */
export function setPointsOrigin(points: PointList, index: number): PointsEdit {
  return { points: [...points.slice(index), ...points.slice(0, index)], indices: [0] };
}

/** Reverses the points, keeping them all selected. */
export function reversePoints(points: PointList): PointsEdit {
  return { points: [...points].reverse(), indices: points.map((_, index) => index) };
}

/** Deletes the selected points. */
export function deletePoints(points: PointList, indices: readonly number[]): PointsEdit {
  const selected = new Set(indices);
  return { points: points.filter((_, index) => !selected.has(index)), indices: [] };
}
