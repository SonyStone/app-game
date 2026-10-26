import type { JSX } from '@solidjs/web';
import { Match, Switch } from 'solid-js';
import type { TreePathState } from './createTreePathHighlight';

/**
 * Colors and shape of the line that joins a row to its parent's line. Every child branch draws its
 * own piece: the stem from the top of the row down to the branch, the branch into the row, and,
 * unless the row is the last child, the tail that carries the parent's line on to later siblings.
 * Colors accept any CSS color, including variables.
 */
export type TreeConnector = Readonly<{
  /** Parent's line from the top of the row down to the branch. */
  stem: string;
  /** Branch from the parent's line into the row. */
  branch: string;
  /** Parent's line below the branch, toward later siblings; not drawn for the last child. */
  tail: string;
  /** Line thickness in pixels. */
  width: number;
  /** Radius of the curve where the branch leaves the line; `0` draws a square corner. */
  radius: number;
}>;

/** Thin neutral lines with lightly rounded branches; the path to the target row is lit. */
export function classicTreeConnector(state: TreePathState): TreeConnector {
  return {
    stem: state === 'path' || state === 'passed' ? TREE_LINE_PATH_COLOR : TREE_LINE_COLOR,
    branch: state === 'path' ? TREE_LINE_PATH_COLOR : TREE_LINE_COLOR,
    tail: state === 'passed' ? TREE_LINE_PATH_COLOR : TREE_LINE_COLOR,
    width: 1,
    radius: 3
  };
}

/**
 * CSS background that draws a connector inside a child branch, whose box starts one indentation
 * step right of its parent row: the parent's line runs through {@link TREE_LINE_CENTER}. Straight
 * pieces reach one pixel into the curve and a continuous line is drawn in one piece, so no
 * anti-aliased seam shows where pieces meet.
 */
export function treeConnectorBackground(connector: TreeConnector, isLast: boolean): string {
  const width = connector.width;
  const left = TREE_LINE_CENTER - width / 2;
  const radius = connector.radius;
  const branchStart = radius > 0 ? TREE_LINE_CENTER + radius - SEAM_OVERLAP : left;
  const lineWidth = `${width}px`;
  const branch = [
    solid(connector.branch, branchStart, TREE_ROW_MIDDLE - width / 2, `${TREE_BRANCH_END - branchStart}px`, lineWidth),
    ...(radius > 0 ? [curve(connector.branch, width, radius)] : [])
  ];
  // A stem that turns into the branch ends where the curve begins, so the turn keeps its rounded
  // outer corner. The parent's line paints above the branch that leaves it, so a faded branch never
  // marks a lit line; a tail of another color runs on from the turn beneath the curve.
  const turnEnd = radius > 0 ? TREE_ROW_MIDDLE - radius : TREE_ROW_MIDDLE - width / 2;
  const turningStem = solid(
    connector.stem,
    left,
    0,
    lineWidth,
    `${radius > 0 ? turnEnd + SEAM_OVERLAP : TREE_ROW_MIDDLE + width / 2}px`
  );
  const layers = isLast
    ? [turningStem, ...branch]
    : connector.stem === connector.tail
      ? [solid(connector.stem, left, 0, lineWidth, '100%'), ...branch]
      : [turningStem, ...branch, solid(connector.tail, left, turnEnd, lineWidth, `calc(100% - ${turnEnd}px)`)];
  return layers.join(', ');
}

/**
 * CSS background that starts an expanded row's children line under the row's anchor, so the line
 * leaves the anchor instead of beginning at the first child. Uses the first child's stem.
 */
export function treeConnectorHead(firstChild: TreeConnector): string {
  const width = firstChild.width;
  return solid(
    firstChild.stem,
    TREE_ANCHOR_CENTER - width / 2,
    TREE_ROW_MIDDLE,
    `${width}px`,
    `${TREE_ROW_HEIGHT - TREE_ROW_MIDDLE}px`
  );
}

/**
 * Classic expansion anchor: a small box with − or + for branches and a dot for leaves. Protected
 * rows, which the browser keeps when it closes them, get a green box as in Tabs Outliner.
 */
export function TreeAnchorBox(props: {
  /** Expansion state, or `undefined` for a row without children. */
  expanded: boolean | undefined;
  protected: boolean;
  /** Whether the row lies on the highlighted path. */
  highlighted: boolean;
}) {
  const stroke = () =>
    props.highlighted ? TREE_LINE_PATH_COLOR : props.protected ? PROTECTED_ANCHOR_COLOR : TREE_ANCHOR_COLOR;
  return (
    <TreeAnchorFace>
      <Switch>
        <Match when={props.expanded === undefined}>
          <circle cx="8.5" cy="8.5" r="1.75" fill={props.highlighted ? TREE_LINE_PATH_COLOR : stroke()} />
        </Match>
        <Match when={props.expanded !== undefined}>
          <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" fill={TREE_PAPER_COLOR} stroke={stroke()} />
          <path
            d={props.expanded ? 'M6.5 8.5h4' : 'M6.5 8.5h4M8.5 6.5v4'}
            stroke={TREE_ANCHOR_MARK_COLOR}
            stroke-width="1.2"
          />
        </Match>
      </Switch>
    </TreeAnchorFace>
  );
}

/** 16 × 16 drawing surface for an expansion anchor, centered on the line it hangs from. */
export function TreeAnchorFace(props: { children: JSX.Element }) {
  return (
    <svg class="pointer-events-none block" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {props.children}
    </svg>
  );
}

/** Horizontal center of a parent's line inside a child branch, matching the anchor's center. */
export const TREE_LINE_CENTER = 8.5;
/** Vertical center of a row, where branches leave the line. */
export const TREE_ROW_MIDDLE = 10.5;
/** Height of a `TreeView` row. */
export const TREE_ROW_HEIGHT = 20;
/** Where a branch ends: at the edge of the row's expansion anchor, short of small markers. */
export const TREE_BRANCH_END = 20;
/**
 * Center of a row's expansion anchor in its branch box: one indentation step plus the line center.
 * The same point is where the row's children line runs.
 */
export const TREE_ANCHOR_CENTER = 24.5;

/** Theme-aware line colors; the explorer theme sets the variables. */
export const TREE_LINE_COLOR = 'var(--tree-line, #5d6977)';
export const TREE_LINE_PATH_COLOR = 'var(--tree-line-path, #7dd3fc)';
export const TREE_PAPER_COLOR = 'var(--tree-paper, #0a0a0a)';
const TREE_ANCHOR_COLOR = 'var(--tree-anchor, #7c8794)';
const TREE_ANCHOR_MARK_COLOR = 'var(--tree-anchor-mark, #d1d9e0)';
const PROTECTED_ANCHOR_COLOR = '#4ade80';

function solid(color: string, left: number, top: number, width: string, height: string): string {
  return `linear-gradient(${color}, ${color}) ${left}px ${top}px / ${width} ${height} no-repeat`;
}

/**
 * Quarter ring joining the line to the branch below it. Its edges fade over one pixel centered on
 * the exact radius, so the ring is as thick as the straight pieces, and its box leaves room for
 * that fade on the outer side.
 */
function curve(color: string, width: number, radius: number): string {
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  const size = outer + SEAM_OVERLAP;
  const ring = `radial-gradient(circle at ${size}px 0, transparent ${inner - 0.5}px, ${color} ${inner + 0.5}px, ${color} ${outer - 0.5}px, transparent ${outer + 0.5}px)`;
  return `${ring} ${TREE_LINE_CENTER + radius - size}px ${TREE_ROW_MIDDLE - radius}px / ${size}px ${size}px no-repeat`;
}

/** Pixels by which straight pieces overlap a curve. */
const SEAM_OVERLAP = 1;
