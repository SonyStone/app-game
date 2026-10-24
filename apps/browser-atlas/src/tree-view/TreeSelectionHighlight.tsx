import type { VirtualNestedList } from '@app-game/solid-virtual';
import type { JSX } from '@solidjs/web';
import { createMemo, For } from 'solid-js';
import type { TreeSelectionRun } from './createTreeSelection';
import { TREE_VIEW_INDENT, TREE_VIEW_VERTICAL_INSET } from './TreeView';

/**
 * Draws the selection the way Finder does: an accent-blue fill with rounded corners and faint lines
 * between rows. Each run of adjacent selected rows forms one shape whose left edge steps with the
 * indentation of its rows, rounded at every outer and inner corner, and whose right edge spans the
 * tree. Rows are placed from the model; only rows near the virtual window are drawn. Render it
 * inside the positioned scrolling element before `TreeView`; the positioned rows paint above it.
 */
export function TreeSelectionHighlight(props: {
  /** Selected runs in visible order. */
  runs: readonly TreeSelectionRun[];
  /** Exact height of every row, matching the virtual list. */
  rowHeight: number;
  /** Virtual list whose scroll position and viewport bound the rows that are drawn. */
  virtual: Pick<VirtualNestedList<unknown>, 'scrollPosition' | 'viewportHeight'>;
}) {
  const pieces = createMemo(() => {
    const firstDrawn = Math.floor(props.virtual.scrollPosition / props.rowHeight) - OVERSCAN_ROWS;
    const lastDrawn =
      Math.ceil((props.virtual.scrollPosition + props.virtual.viewportHeight) / props.rowHeight) + OVERSCAN_ROWS;
    const drawn: JSX.CSSProperties[] = [];
    for (const run of props.runs) {
      run.depths.forEach((depth, offset) => {
        const index = run.first + offset;
        if (index < firstDrawn || index > lastDrawn) {
          return;
        }

        const top = TREE_VIEW_VERTICAL_INSET + index * props.rowHeight;
        const left = rowLeft(depth);
        const aboveDepth = run.depths[offset - 1];
        const belowDepth = run.depths[offset + 1];
        const above = aboveDepth === undefined ? undefined : rowLeft(aboveDepth);
        const below = belowDepth === undefined ? undefined : rowLeft(belowDepth);
        drawn.push(rowPiece(top, props.rowHeight, left, above, below));
        if (above !== undefined && above !== left) {
          drawn.push(innerCornerPiece(top, left, above));
        }
      });
    }
    return drawn;
  });

  return (
    <For each={pieces()} keyed={false}>
      {(piece) => <div class="pointer-events-none absolute" style={piece()} data-tree-selection aria-hidden="true" />}
    </For>
  );
}

/** Left edge of a row's fill: just before its expansion anchor. */
function rowLeft(depth: number): number {
  return (depth + 1) * TREE_VIEW_INDENT - ANCHOR_MARGIN;
}

/** One row of a run, rounded wherever its corner is on the outline of the run's shape. */
function rowPiece(
  top: number,
  height: number,
  left: number,
  above: number | undefined,
  below: number | undefined
): JSX.CSSProperties {
  const corner = (outer: boolean) => (outer ? `${RADIUS}px` : '0');
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `${left}px`,
    right: `${RIGHT_INSET}px`,
    'background-color': SELECTION_COLOR,
    'border-radius': [
      corner(above === undefined || above > left),
      corner(above === undefined),
      corner(below === undefined),
      corner(below === undefined || below > left)
    ].join(' '),
    // The line between two rows covers only their shared width, not an outline step.
    ...(below === undefined
      ? {}
      : {
          'background-image': `linear-gradient(${ROW_SEPARATOR_COLOR}, ${ROW_SEPARATOR_COLOR})`,
          'background-size': `calc(100% - ${Math.max(0, below - left)}px) 1px`,
          'background-position': 'right bottom',
          'background-repeat': 'no-repeat'
        })
  };
}

/**
 * Fills the inner corner where a row's left edge steps from the row above: a square outside both
 * rows, transparent inside a quarter circle, so the two edges meet in a rounded curve.
 */
function innerCornerPiece(top: number, left: number, above: number): JSX.CSSProperties {
  const indented = left > above;
  return {
    top: `${indented ? top : top - RADIUS}px`,
    left: `${(indented ? left : above) - RADIUS}px`,
    width: `${RADIUS}px`,
    height: `${RADIUS}px`,
    'background-image': `radial-gradient(circle at ${indented ? '0 100%' : '0 0'}, transparent ${RADIUS - 0.5}px, ${SELECTION_COLOR} ${RADIUS}px)`
  };
}

/** Finder's selection accent, used in both themes with white row text. */
const SELECTION_COLOR = '#0058d0';
const ROW_SEPARATOR_COLOR = 'rgb(0 0 0 / 0.22)';
const RADIUS = 5;
const ANCHOR_MARGIN = 2;
const RIGHT_INSET = 4;
const OVERSCAN_ROWS = 10;
