import { createContext, useContext } from 'solid-js';
import type { Span } from './board';

/** Reference cell for the default layout, trial radii and historical board migrations. */
export const referenceCell = 44;
/** Fixed space between adjacent cells. */
export const cellGap = 4;
/** Plate inset around the outermost cells. */
export const panelPadding = 6;

/** Pixel geometry for one editor. Each read follows the host's current cell size. */
export function createGrid(requestedCell: () => number | undefined) {
  const cell = () => {
    const size = requestedCell();
    return size !== undefined && Number.isFinite(size) && size > 0 ? size : referenceCell;
  };
  const pitch = () => cell() + cellGap;
  const length = (cells: number) => cells * pitch() - cellGap;
  /** Size class for look selection. One-cell controls also fit the smallest trial size. */
  const room = (span: Span): Span => {
    const tracks = (cells: number) => Math.max(1, Math.floor((cells * pitch()) / (referenceCell + cellGap)));
    return { columns: tracks(span.columns), rows: tracks(span.rows) };
  };
  /** Smallest current span that can show a look designed for `min` reference tracks. */
  const minimumSpan = (min: Span): Span => {
    const cells = (tracks: number) => (tracks <= 1 ? 1 : Math.ceil((tracks * (referenceCell + cellGap)) / pitch()));
    return { columns: cells(min.columns), rows: cells(min.rows) };
  };
  return { cell, pitch, length, room, minimumSpan };
}

export const GridContext = createContext(createGrid(() => undefined));

/** Captures the editor's grid for rendering and pointer callbacks. */
export function useGrid() {
  return useContext(GridContext);
}
