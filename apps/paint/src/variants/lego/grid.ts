import { createContext, useContext } from 'solid-js';
import type { Span } from './board';

/** The cell edge in CSS pixels for a fresh device. Layouts fit at 28 px, the smallest size found comfortable with a pen. */
export const defaultCell = 32;
/**
 * The cell the first layouts were made at. Plate radii keep their share of it at every size (18 px at 44), boards
 * stored before cells were counted keep their positions in its pitch, and a press area stays this large.
 */
export const referenceCell = 44;
/** A plate's corner radius in CSS pixels at `referenceCell`, the user's choice (2026-11-19); see `plateRadius`. */
const referencePlateRadius = 18;
/** Fixed space between adjacent cells. */
export const cellGap = 4;
/** Plate inset around the outermost cells. */
export const panelPadding = 6;

/** A part's size in CSS pixels, by which its looks and captions are decided. */
export type Room = { width: number; height: number };

/** Pixel geometry for one editor. Each read follows the host's current cell size. */
export function createGrid(requestedCell: () => number | undefined) {
  const cell = () => {
    const size = requestedCell();
    return size !== undefined && Number.isFinite(size) && size > 0 ? size : defaultCell;
  };
  const pitch = () => cell() + cellGap;
  const length = (cells: number) => cells * pitch() - cellGap;
  /** The pixels a part of `span` has, which its looks are decided by. */
  const room = (span: Span): Room => ({ width: length(span.columns), height: length(span.rows) });
  /** The smallest span with at least `min` pixels each way, and at least one cell. */
  const minimumSpan = (min: Room): Span => {
    const cells = (pixels: number) => Math.max(1, Math.ceil((pixels + cellGap) / pitch()));
    return { columns: cells(min.width), rows: cells(min.height) };
  };
  return { cell, pitch, length, room, minimumSpan };
}

/**
 * A plate's corner radius in CSS pixels at a cell of `cell` pixels: 18 px at the reference 44, the same share of the
 * cell at every size. Every other corner in the editor derives from it (see `LegoStudio.module.css`).
 */
export function plateRadius(cell: number) {
  return (referencePlateRadius * cell) / referenceCell;
}

export const GridContext = createContext(createGrid(() => undefined));

/** Captures the editor's grid for rendering and pointer callbacks. */
export function useGrid() {
  return useContext(GridContext);
}
