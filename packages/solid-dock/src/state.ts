/**
 * Dock layout model.
 *
 * The state is a flat, serializable record of nodes. Every operation mutates the
 * state it receives, so the same function works on a plain object and on a Solid
 * store draft: `setDock((draft) => movePanel(draft, 'search', target))`.
 *
 * Operations finish with {@link normalizeDockState}, so callers may also edit the
 * store directly and call it afterwards to restore the invariants.
 */

/** Identifier of a split or group node inside {@link DockState.nodes}. */
export type DockNodeId = string;

/** Identifier of a panel declared with `<Dock.Panel id>`. */
export type PanelId = string;

/** Whole dock layout: the root node id plus every node by id. */
export type DockState = {
  root: DockNodeId;
  nodes: Record<DockNodeId, DockNode>;
};

/** Node of the layout tree. */
export type DockNode = DockSplitNode | DockGroupNode;

/**
 * Lays its children out in one direction.
 *
 * `sizes` are flex weights aligned with `children`; their sum is arbitrary.
 */
export type DockSplitNode = {
  type: 'split';
  direction: DockDirection;
  children: DockNodeId[];
  sizes: number[];
};

/** `row` places children left to right, `column` top to bottom. */
export type DockDirection = 'row' | 'column';

/** Stack of panels shown one at a time, usually as tabs. */
export type DockGroupNode = {
  type: 'group';
  panels: PanelId[];
  /** Visible panel. Falls back to the first panel when missing or stale. */
  active?: PanelId;
};

/** Side of a group or of the whole dock. */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

/** Where a drop lands relative to a group: inside it or beside one of its edges. */
export type DockZone = DockEdge | 'center';

/**
 * Destination of a move.
 *
 * - `group` + `center` adds to the group, at `index` when given (index among the
 *   group's panels without the moved panel).
 * - `group` + edge splits the group and places the moved content on that side.
 * - `root` places the moved content along an edge of the whole dock.
 */
export type DockDropTarget =
  | { type: 'group'; groupId: DockNodeId; zone: DockZone; index?: number }
  | { type: 'root'; edge: DockEdge };

/** Declarative layout accepted by {@link createDockState}. */
export type DockLayoutDescription =
  | { group: PanelId[]; active?: PanelId; id?: DockNodeId }
  | { row: DockLayoutDescription[]; sizes?: number[]; id?: DockNodeId }
  | { column: DockLayoutDescription[]; sizes?: number[]; id?: DockNodeId };

/**
 * Builds a normalized {@link DockState} from a nested description.
 *
 * Node ids default to `group-N` / `split-N`.
 *
 * @example
 * ```ts
 * createDockState({
 *   row: [{ group: ['explorer', 'search'] }, { column: [{ group: ['editor'] }, { group: ['console'] }], sizes: [3, 1] }],
 *   sizes: [1, 3]
 * });
 * ```
 */
export function createDockState(layout: DockLayoutDescription): DockState {
  const state: DockState = { root: '', nodes: {} };
  state.root = addDescription(state, layout);
  normalizeDockState(state);
  return state;
}

function addDescription(state: DockState, layout: DockLayoutDescription): DockNodeId {
  if ('group' in layout) {
    const id = layout.id ?? createNodeId(state, 'group');
    state.nodes[id] = { type: 'group', panels: [...layout.group], active: layout.active };
    return id;
  }

  const direction: DockDirection = 'row' in layout ? 'row' : 'column';
  const items = 'row' in layout ? layout.row : layout.column;
  const id = layout.id ?? createNodeId(state, 'split');
  // Reserve the id before the children pick theirs.
  state.nodes[id] = { type: 'split', direction, children: [], sizes: [] };

  const children = items.map((item) => addDescription(state, item));
  state.nodes[id] = { type: 'split', direction, children, sizes: layout.sizes ? [...layout.sizes] : [] };

  return id;
}

/** Returns the group that shows `panelId`, or `undefined` when the panel is closed. */
export function findPanelGroup(state: DockState, panelId: PanelId): DockNodeId | undefined {
  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.type === 'group' && node.panels.includes(panelId)) {
      return id;
    }
  }

  return undefined;
}

/** Returns the split that contains `nodeId`, or `undefined` for the root. */
export function findParentSplit(state: DockState, nodeId: DockNodeId): DockNodeId | undefined {
  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.type === 'split' && node.children.includes(nodeId)) {
      return id;
    }
  }

  return undefined;
}

/** Returns group ids in visual order (depth-first from the root). */
export function listGroups(state: DockState): DockNodeId[] {
  const groups: DockNodeId[] = [];

  function visit(id: DockNodeId): void {
    const node = state.nodes[id];
    if (!node) {
      return;
    }

    if (node.type === 'group') {
      groups.push(id);
      return;
    }

    node.children.forEach(visit);
  }

  visit(state.root);
  return groups;
}

/** Returns the panel a group shows: `active` when it belongs to the group, otherwise the first panel. */
export function activePanelOf(group: DockGroupNode): PanelId | undefined {
  return group.active !== undefined && group.panels.includes(group.active) ? group.active : group.panels[0];
}

/** Makes `panelId` the visible panel of its group. Does nothing for closed panels. */
export function activatePanel(state: DockState, panelId: PanelId): void {
  const group = getGroup(state, findPanelGroup(state, panelId));
  if (group) {
    group.active = panelId;
  }
}

/**
 * Shows a panel.
 *
 * An open panel is only activated. A closed panel goes to `target`, or to the
 * first group when no target is given.
 */
export function openPanel(state: DockState, panelId: PanelId, target?: DockDropTarget): void {
  if (findPanelGroup(state, panelId) !== undefined) {
    activatePanel(state, panelId);
    return;
  }

  placePanel(state, panelId, target ?? { type: 'group', groupId: listGroups(state)[0] ?? state.root, zone: 'center' });
  normalizeDockState(state);
}

/** Removes a panel from the layout. Groups left empty disappear, except an empty root group. */
export function closePanel(state: DockState, panelId: PanelId): void {
  detachPanel(state, panelId);
  normalizeDockState(state);
}

/**
 * Moves an open panel to `target`.
 *
 * Moving the only panel of a group beside that same group, or into it without an
 * index, leaves the layout unchanged.
 */
export function movePanel(state: DockState, panelId: PanelId, target: DockDropTarget): void {
  const sourceId = findPanelGroup(state, panelId);
  const source = getGroup(state, sourceId);
  if (!source) {
    return;
  }

  if (target.type === 'group' && target.groupId === sourceId) {
    const reorder = target.zone === 'center' && target.index !== undefined;
    const split = target.zone !== 'center' && source.panels.length > 1;
    if (!reorder && !split) {
      return;
    }
  }

  detachPanel(state, panelId);
  placePanel(state, panelId, target);
  normalizeDockState(state);
}

/**
 * Moves a whole group to `target`.
 *
 * `center` merges the group's panels into the target group and keeps the moved
 * group's active panel visible. Edges and root edges move the group node itself.
 */
export function moveGroup(state: DockState, groupId: DockNodeId, target: DockDropTarget): void {
  const group = getGroup(state, groupId);
  if (!group || (target.type === 'group' && target.groupId === groupId)) {
    return;
  }

  if (target.type === 'group' && target.zone === 'center') {
    const destination = getGroup(state, target.groupId);
    if (!destination) {
      return;
    }

    const moved = [...group.panels];
    const active = activePanelOf(group);
    group.panels = [];
    destination.panels.splice(target.index ?? destination.panels.length, 0, ...moved);
    destination.active = active;
    normalizeDockState(state);
    return;
  }

  if (groupId === state.root) {
    return;
  }

  detachNode(state, groupId);
  if (target.type === 'root') {
    insertBeside(state, state.root, groupId, target.edge, ROOT_EDGE_SHARE);
  } else {
    insertBeside(state, target.groupId, groupId, target.zone as DockEdge, 0.5);
  }
  normalizeDockState(state);
}

/**
 * Whether moving `subject` to `target` would change the layout's structure (which
 * panels sit in which groups, and how groups are split), ignoring sizes, ids and
 * active tabs. The move is applied to a copy of `base` (default: `current`) and
 * compared with `current`; pass the drag-start layout as `base` when the
 * current layout is a live or detached preview of the drag. Both must be plain
 * objects, not store proxies.
 */
export function wouldChangeLayout(
  current: DockState,
  subject: DockMoveSubject,
  target: DockDropTarget,
  base: DockState = current
): boolean {
  return moveResultShape(base, subject, target) !== layoutShape(current);
}

/** What a move acts on: one panel, or a whole group. */
export type DockMoveSubject = { type: 'panel'; panelId: PanelId } | { type: 'group'; groupId: DockNodeId };

/**
 * Whether two targets give the same layout structure when `subject` is moved
 * from `base` (sizes aside), such as the right edge of a group that already runs
 * along the right of the dock and the dock's own right edge.
 */
export function sameMoveResult(
  base: DockState,
  subject: DockMoveSubject,
  left: DockDropTarget,
  right: DockDropTarget
): boolean {
  return moveResultShape(base, subject, left) === moveResultShape(base, subject, right);
}

function moveResultShape(base: DockState, subject: DockMoveSubject, target: DockDropTarget): string {
  const next = structuredClone(base);
  if (subject.type === 'panel') {
    movePanel(next, subject.panelId, target);
  } else {
    moveGroup(next, subject.groupId, target);
  }
  return layoutShape(next);
}

/** Structure of a layout as text: `row(column([a b],[c]),[d])`. */
function layoutShape(state: DockState, id = state.root): string {
  const node = state.nodes[id];
  if (!node) {
    return '';
  }

  if (node.type === 'group') {
    return `[${node.panels.join(' ')}]`;
  }

  return `${node.direction}(${node.children.map((child) => layoutShape(state, child)).join(',')})`;
}

/** Size range along one axis, in pixels. `max` may be `Infinity`. */
export type DockSizeLimits = { min: number; max: number };

/**
 * Size range of a node along `axis`, from its panels' own limits: a group must
 * satisfy every panel it holds (largest minimum, smallest maximum); a split along
 * `axis` adds its children up, a split across it takes the tightest child range.
 * When limits conflict the minimum wins.
 */
export function nodeLimits(
  state: DockState,
  nodeId: DockNodeId,
  axis: 'width' | 'height',
  panelLimits: (panelId: PanelId) => DockSizeLimits
): DockSizeLimits {
  const node = state.nodes[nodeId];
  if (!node) {
    return { min: 0, max: Infinity };
  }

  const parts =
    node.type === 'group'
      ? node.panels.map(panelLimits)
      : node.children.map((child) => nodeLimits(state, child, axis, panelLimits));
  const alongAxis = node.type === 'split' && (node.direction === 'row') === (axis === 'width');
  const min = alongAxis ? sum(parts.map((part) => part.min)) : Math.max(0, ...parts.map((part) => part.min));
  const max = alongAxis ? sum(parts.map((part) => part.max)) : Math.min(Infinity, ...parts.map((part) => part.max));
  return { min, max: Math.max(min, max) };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Replaces the flex weights of a split. Ignores arrays of the wrong length. */
export function resizeSplit(state: DockState, splitId: DockNodeId, sizes: readonly number[]): void {
  const split = state.nodes[splitId];
  if (split?.type === 'split' && sizes.length === split.children.length) {
    split.sizes = [...sizes];
  }
}

/**
 * Moves the boundary after child `index` by `deltaPx`, keeping both neighbours at
 * least `minSizePx` and within their own `limits` (pixel ranges for the children
 * at `index` and `index + 1`). Returns new weights; `sizes` is not modified.
 */
export function resizeWeights(
  sizes: readonly number[],
  index: number,
  deltaPx: number,
  containerPx: number,
  minSizePx: number,
  limits: readonly [DockSizeLimits, DockSizeLimits] = [
    { min: 0, max: Infinity },
    { min: 0, max: Infinity }
  ]
): number[] {
  const next = [...sizes];
  const before = next[index];
  const after = next[index + 1];
  if (containerPx <= 0 || before === undefined || after === undefined) {
    return next;
  }

  const total = next.reduce((sum, size) => sum + size, 0);
  const toPx = containerPx / total;
  const beforePx = before * toPx;
  const afterPx = after * toPx;
  const lower = Math.max(Math.max(minSizePx, limits[0].min) - beforePx, afterPx - limits[1].max);
  const upper = Math.min(limits[0].max - beforePx, afterPx - Math.max(minSizePx, limits[1].min));
  // A pair that already breaks its limits (min above max) stays put rather than jump.
  const clamped = lower > upper ? 0 : Math.max(lower, Math.min(upper, deltaPx));
  const shift = Math.max(-beforePx, Math.min(afterPx, clamped)) / toPx;

  next[index] = before + shift;
  next[index + 1] = after - shift;
  return next;
}

/**
 * Restores the layout invariants in place:
 * - every panel appears in at most one group;
 * - `active` points at a panel of its group;
 * - empty groups are removed, except an empty root group;
 * - splits have at least two children and `sizes` aligned with them;
 * - a split never directly contains a split with the same direction;
 * - nodes unreachable from the root are deleted.
 */
export function normalizeDockState(state: DockState): void {
  const seenPanels = new Set<PanelId>();
  const reachable = new Set<DockNodeId>();

  function visit(id: DockNodeId): DockNodeId | undefined {
    const node = state.nodes[id];
    if (!node) {
      return undefined;
    }

    if (node.type === 'group') {
      const panels = node.panels.filter((panelId) => !seenPanels.has(panelId));
      panels.forEach((panelId) => seenPanels.add(panelId));
      if (panels.length !== node.panels.length) {
        node.panels = panels;
      }

      if (node.active !== undefined && !panels.includes(node.active)) {
        node.active = panels[0];
      }

      if (panels.length === 0 && id !== state.root) {
        return undefined;
      }

      reachable.add(id);
      return id;
    }

    const children: DockNodeId[] = [];
    const sizes: number[] = [];
    node.children.forEach((childId, index) => {
      const replacement = visit(childId);
      if (replacement === undefined) {
        return;
      }

      const weight = sanitizeWeight(node.sizes[index]);
      const child = state.nodes[replacement];
      if (child?.type === 'split' && child.direction === node.direction) {
        const total = child.sizes.reduce((sum, size) => sum + size, 0);
        child.children.forEach((grandchildId, grandchildIndex) => {
          children.push(grandchildId);
          sizes.push((weight * child.sizes[grandchildIndex]) / total);
        });
        reachable.delete(replacement);
        return;
      }

      children.push(replacement);
      sizes.push(weight);
    });

    if (children.length === 0) {
      return undefined;
    }

    if (children.length === 1) {
      return children[0];
    }

    if (!sameItems(children, node.children)) {
      node.children = children;
    }
    rescaleWeights(sizes);
    if (!sameItems(sizes, node.sizes)) {
      node.sizes = sizes;
    }

    reachable.add(id);
    return id;
  }

  const root = visit(state.root);
  if (root === undefined) {
    const id = createNodeId(state, 'group');
    state.nodes[id] = { type: 'group', panels: [] };
    state.root = id;
    reachable.add(id);
  } else if (root !== state.root) {
    state.root = root;
  }

  for (const id of Object.keys(state.nodes)) {
    if (!reachable.has(id)) {
      delete state.nodes[id];
    }
  }
}

/** Share of the dock given to content dropped on a root edge. */
const ROOT_EDGE_SHARE = 0.25;

function getGroup(state: DockState, id: DockNodeId | undefined): DockGroupNode | undefined {
  const node = id === undefined ? undefined : state.nodes[id];
  return node?.type === 'group' ? node : undefined;
}

/** Removes a panel from its group without normalizing, so the group may become empty. */
function detachPanel(state: DockState, panelId: PanelId): void {
  const group = getGroup(state, findPanelGroup(state, panelId));
  if (!group) {
    return;
  }

  const index = group.panels.indexOf(panelId);
  group.panels.splice(index, 1);
  if (group.active === panelId) {
    group.active = group.panels[Math.min(index, group.panels.length - 1)];
  }
}

/** Adds a detached panel at `target` without normalizing. */
function placePanel(state: DockState, panelId: PanelId, target: DockDropTarget): void {
  if (target.type === 'group' && target.zone === 'center') {
    const group = getGroup(state, target.groupId);
    if (group) {
      group.panels.splice(target.index ?? group.panels.length, 0, panelId);
      group.active = panelId;
      return;
    }
  }

  const groupId = createNodeId(state, 'group');
  state.nodes[groupId] = { type: 'group', panels: [panelId], active: panelId };

  if (target.type === 'group' && target.zone !== 'center' && getGroup(state, target.groupId)) {
    insertBeside(state, target.groupId, groupId, target.zone, 0.5);
  } else {
    insertBeside(state, state.root, groupId, target.type === 'root' ? target.edge : 'right', ROOT_EDGE_SHARE);
  }
}

/** Removes a node from its parent split without deleting it from `nodes`. */
function detachNode(state: DockState, nodeId: DockNodeId): void {
  const parent = state.nodes[findParentSplit(state, nodeId) ?? ''];
  if (parent?.type !== 'split') {
    return;
  }

  const index = parent.children.indexOf(nodeId);
  parent.children.splice(index, 1);
  parent.sizes.splice(index, 1);
}

/**
 * Places `nodeId` on `edge` of `targetId`, taking `share` of the target's space.
 *
 * Reuses the parent split when it already runs in the needed direction, otherwise
 * wraps the target in a new split.
 */
function insertBeside(state: DockState, targetId: DockNodeId, nodeId: DockNodeId, edge: DockEdge, share: number): void {
  const direction: DockDirection = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const before = edge === 'left' || edge === 'top';
  const parentId = findParentSplit(state, targetId);
  const parent = parentId === undefined ? undefined : state.nodes[parentId];

  if (parent?.type === 'split' && parent.direction === direction) {
    alignSizes(parent);
    const index = parent.children.indexOf(targetId);
    const weight = parent.sizes[index];
    parent.sizes[index] = weight * (1 - share);
    const at = before ? index : index + 1;
    parent.children.splice(at, 0, nodeId);
    parent.sizes.splice(at, 0, weight * share);
    return;
  }

  const splitId = createNodeId(state, 'split');
  const pair = before ? [nodeId, targetId] : [targetId, nodeId];
  const weights = before ? [share, 1 - share] : [1 - share, share];
  state.nodes[splitId] = { type: 'split', direction, children: pair, sizes: weights };

  if (parent?.type === 'split') {
    parent.children[parent.children.indexOf(targetId)] = splitId;
  } else {
    state.root = splitId;
  }
}

/**
 * Splits, edge drops and flattening multiply weights by fractions, so repeated
 * moves drift them towards zero. Rescales in place to an average of 1 once the
 * average leaves [1/16, 16]; ratios are unchanged.
 */
function rescaleWeights(sizes: number[]): void {
  const average = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  if (average >= 1 / 16 && average <= 16) {
    return;
  }

  sizes.forEach((size, index) => (sizes[index] = size / average));
}

/** Pads or trims `sizes` to match `children`, replacing invalid weights with 1. */
function alignSizes(split: DockSplitNode): void {
  split.sizes = split.children.map((_, index) => sanitizeWeight(split.sizes[index]));
}

function sanitizeWeight(weight: number | undefined): number {
  return weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** Returns the first unused `${prefix}-N` id. */
function createNodeId(state: DockState, prefix: string): DockNodeId {
  let index = 1;
  while (state.nodes[`${prefix}-${index}`] !== undefined) {
    index += 1;
  }
  return `${prefix}-${index}`;
}
