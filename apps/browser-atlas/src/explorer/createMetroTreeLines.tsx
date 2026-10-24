import { createEffect, createMemo, Match, Switch } from 'solid-js';
import type { TreePathHighlight, TreePathState } from '../tree-view/createTreePathHighlight';
import type { TreeViewItem, TreeViewModel } from '../tree-view/createTreeView';
import { TreeAnchorFace, type TreeConnector } from '../tree-view/treeLines';
import { assignMetroLineNumbers, metroLineColor } from './metroLineNumbers';
import type { ExplorerTreeNode } from './model';

/**
 * Draws the explorer tree like the classic lines, styled as a Moscow metro map. Every group below the
 * root — a window, saved window, group, or folder — starts a line in the colors of the Moscow
 * scheme, marked by a disc without a number so it never competes with the counts of collapsed
 * rows; a gray trunk joins these discs to the root. Rows hang on their group's line with rounded
 * branches that end at the edge of their markers, as classic branches do: a station dot for a
 * leaf, just clear of its branch, a white interchange for a row with children, and a new line's
 * disc for a nested group. Each line has a hidden number that picks
 * its color and belongs to its group: it is remembered per browser and stays while the group
 * exists, so adding or reordering windows never recolors the others. While the pointer rests on a
 * row, every line off the route to it fades; a route to the focused row alone leaves the map in
 * full color.
 */
export function createMetroTreeLines(props: {
  /** Explorer tree whose groups become lines. */
  tree: TreeViewModel<ExplorerTreeNode>;
  /** Stable name of the tree whose line numbers are remembered, such as the browser's label and collection. */
  storageScope: () => string;
  /** Highlighted route to the hovered or focused row. */
  path: TreePathHighlight<ExplorerTreeNode>;
}) {
  const lineStartIds = createMemo(() => collectLineStarts(props.tree.children()));
  const lineNumbers = createMemo(() =>
    assignMetroLineNumbers(readMetroLineNumbers()[props.storageScope()] ?? {}, lineStartIds())
  );
  const hangingLines = createMemo(() => findHangingLines(props.tree.visibleItems(), lineNumbers()));
  createEffect(
    () => ({ scope: props.storageScope(), numbers: lineNumbers() }),
    ({ scope, numbers }) => writeMetroLineNumbers(scope, numbers)
  );

  return {
    /** Connector of a row on the line it hangs from, or on the gray trunk below the root. */
    connector(item: TreeViewItem<ExplorerTreeNode>): TreeConnector {
      const state = routeState(item);
      const line = hangingLines().get(item.id) ?? TRUNK_COLOR;
      const full = tone(line, false);
      const faded = tone(line, state !== 'none');
      return {
        stem: state === 'path' || state === 'passed' ? full : faded,
        branch: state === 'path' ? full : faded,
        tail: state === 'passed' ? full : faded,
        width: LINE_WIDTH,
        radius: BRANCH_RADIUS
      };
    },
    /** Anchor face: a hub for the root, a line's disc for a group, an interchange, or a station. */
    anchor(item: TreeViewItem<ExplorerTreeNode>) {
      const number = () => lineNumbers().get(item.id);
      const color = () => {
        const current = number();
        return current === undefined ? undefined : metroLineColor(current);
      };
      const hanging = () => hangingLines().get(item.id) ?? TRUNK_COLOR;
      // A passed row's line carries the route, but its own disc or interchange is off it.
      const dimmed = () => routeState(item) === 'off' || routeState(item) === 'passed';
      const paint = (color: string) => tone(color, dimmed());
      return (
        <TreeAnchorFace>
          <g data-metro-route={dimmed() ? 'off' : 'on'}>
            <Switch>
              <Match when={color()}>
                {(lineColor) => (
                  <g data-metro-line={number()}>
                    <circle
                      cx="8.5"
                      cy="8.5"
                      r={item.isExpanded ? 6 : 5.25}
                      fill={item.isExpanded ? paint(lineColor()) : METRO_PAPER}
                      stroke={item.isExpanded ? 'none' : paint(lineColor())}
                      stroke-width="2.5"
                    />
                    {!item.isExpanded && <circle cx="8.5" cy="8.5" r="1.75" fill={paint(lineColor())} />}
                  </g>
                )}
              </Match>
              <Match when={item.depth === 0}>
                <circle cx="8.5" cy="8.5" r="4" fill={METRO_PAPER} stroke={paint(HUB_COLOR)} stroke-width="2" />
              </Match>
              <Match when={item.childCount > 0}>
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="4.75"
                  fill={paint(INTERCHANGE_COLOR)}
                  stroke={paint(hanging())}
                  stroke-width="2.5"
                />
                {!item.isExpanded && <circle cx="8.5" cy="8.5" r="1.5" fill={paint(hanging())} />}
              </Match>
              <Match when={item.childCount === 0}>
                <circle cx="8.5" cy="8.5" r="2.25" fill={paint(hanging())} />
              </Match>
            </Switch>
          </g>
        </TreeAnchorFace>
      );
    }
  } as const;

  function routeState(item: TreeViewItem<ExplorerTreeNode>): TreePathState {
    return props.path.source() === 'hover' ? props.path.state(item) : 'none';
  }
}

function collectLineStarts(items: readonly TreeViewItem<ExplorerTreeNode>[]): string[] {
  return items.flatMap((item) => [...(isLineStart(item) ? [item.id] : []), ...collectLineStarts(item.children())]);
}

function isLineStart(item: TreeViewItem<ExplorerTreeNode>): boolean {
  return item.depth > 0 && item.item.kind === 'group';
}

/** Color of the line each visible row hangs from: the nearest group above it that starts a line. */
function findHangingLines(
  items: readonly TreeViewItem<ExplorerTreeNode>[],
  numbers: ReadonlyMap<string, number>
): ReadonlyMap<string, string> {
  const hanging = new Map<string, string>();
  const linesByDepth: (string | undefined)[] = [];
  for (const item of items) {
    const parentLine = item.depth > 0 ? linesByDepth[item.depth - 1] : undefined;
    if (parentLine) {
      hanging.set(item.id, parentLine);
    }

    const number = numbers.get(item.id);
    linesByDepth[item.depth] = number === undefined ? parentLine : metroLineColor(number);
    linesByDepth.length = item.depth + 1;
  }
  return hanging;
}

/**
 * Mutes a scheme color toward the theme background, deeper on dark and softer on light, and much
 * further for parts off a highlighted route. The result stays opaque, so where a branch meets its
 * line or runs under a marker no overlap shows through.
 */
function tone(color: string, faded: boolean): string {
  return `color-mix(in oklch, ${color} ${faded ? FADED_PERCENT : MUTED_PERCENT}%, ${METRO_PAPER})`;
}

function readMetroLineNumbers(): Record<string, Record<string, number>> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(METRO_LINES_STORAGE_KEY) ?? '{}');
    return typeof value === 'object' && value !== null ? (value as Record<string, Record<string, number>>) : {};
  } catch {
    return {};
  }
}

/**
 * Remembers the current numbers ahead of earlier ones. Groups missing from the tree keep their
 * entry, so a tree that is still loading, or a window that comes back, does not renumber anything;
 * the oldest entries beyond the limit are forgotten.
 */
function writeMetroLineNumbers(scope: string, numbers: ReadonlyMap<string, number>): void {
  const stored = readMetroLineNumbers();
  const earlier = Object.entries(stored[scope] ?? {}).filter(([id]) => !numbers.has(id));
  const next = Object.fromEntries([...numbers, ...earlier].slice(0, REMEMBERED_LINES_LIMIT));
  if (JSON.stringify(stored[scope] ?? {}) === JSON.stringify(next)) {
    return;
  }

  try {
    globalThis.localStorage?.setItem(METRO_LINES_STORAGE_KEY, JSON.stringify({ ...stored, [scope]: next }));
  } catch {
    // Numbers stay stable for this session even when storage is unavailable.
  }
}

const METRO_LINES_STORAGE_KEY = 'browserAtlas.metroLines.v1';
const REMEMBERED_LINES_LIMIT = 200;
const METRO_PAPER = 'var(--tree-paper, #0a0a0a)';
const HUB_COLOR = 'var(--tree-anchor, #7c8794)';
const TRUNK_COLOR = HUB_COLOR;
const INTERCHANGE_COLOR = '#ffffff';
const LINE_WIDTH = 3;
const BRANCH_RADIUS = 5;
const MUTED_PERCENT = 68;
const FADED_PERCENT = 24;
