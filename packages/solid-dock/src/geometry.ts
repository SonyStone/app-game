import type { DockDropTarget, DockEdge, DockNodeId, DockZone, PanelId } from './state';

/** Axis-aligned rectangle in pixels. */
export type DockRect = { x: number; y: number; width: number; height: number };

/** Pointer position in client coordinates. */
export type DockPoint = { x: number; y: number };

/** What is being dragged. */
export type DockDragSubject =
  | { type: 'panel'; panelId: PanelId; groupId: DockNodeId }
  | { type: 'group'; groupId: DockNodeId };

/** Client-space geometry of one group, collected when the pointer moves. */
export type DockGroupGeometry = {
  id: DockNodeId;
  panels: readonly PanelId[];
  content?: DockRect;
  tabList?: DockRect;
  /** Tab rectangles keyed by panel id. */
  tabs: ReadonlyMap<PanelId, DockRect>;
};

/**
 * Default drop-target resolver.
 *
 * Checks, in order: tab lists (insertion by tab midpoints), a thin band along
 * the dock edges, then group content split into five zones. Drops that would not
 * change the layout resolve to `undefined`, so no indicator is shown for them.
 */
export function findDropTarget(
  point: DockPoint,
  subject: DockDragSubject,
  root: DockRect,
  groups: readonly DockGroupGeometry[]
): DockDropTarget | undefined {
  if (!containsPoint(root, point)) {
    return undefined;
  }

  for (const group of groups) {
    if (group.tabList && containsPoint(group.tabList, point)) {
      if (subject.type === 'group' && subject.groupId === group.id) {
        return undefined;
      }

      const draggedId = subject.type === 'panel' ? subject.panelId : undefined;
      return { type: 'group', groupId: group.id, zone: 'center', index: tabInsertionIndex(group, draggedId, point) };
    }
  }

  const edge = edgeBand(root, point, ROOT_EDGE_BAND_PX);
  if (edge && groups.length > 1) {
    return { type: 'root', edge };
  }

  for (const group of groups) {
    if (!group.content || !containsPoint(group.content, point)) {
      continue;
    }

    const zone = dropZone(group.content, point);
    return changesLayout(subject, group, zone) ? { type: 'group', groupId: group.id, zone } : undefined;
  }

  return undefined;
}

/**
 * Drop-target resolver for docking guides (the Visual Studio "compass"): a drop
 * lands only when the pointer is over a guide. Each group shows five guides
 * around its centre, the dock shows one guide in the middle of each edge (see
 * {@link dockGuides} and {@link dockRootGuides}). Tab strips still accept tab insertions.
 */
export function findGuideDropTarget(
  point: DockPoint,
  subject: DockDragSubject,
  root: DockRect,
  groups: readonly DockGroupGeometry[]
): DockDropTarget | undefined {
  if (!containsPoint(root, point)) {
    return undefined;
  }

  if (groups.length > 1) {
    const edge = dockRootGuides(root).find((guide) => containsPoint(guide.rect, point))?.edge;
    if (edge) {
      return { type: 'root', edge };
    }
  }

  for (const group of groups) {
    if (
      group.tabList &&
      containsPoint(group.tabList, point) &&
      !(subject.type === 'group' && subject.groupId === group.id)
    ) {
      const draggedId = subject.type === 'panel' ? subject.panelId : undefined;
      return { type: 'group', groupId: group.id, zone: 'center', index: tabInsertionIndex(group, draggedId, point) };
    }

    if (!group.content || !containsPoint(group.content, point)) {
      continue;
    }

    const zone = dockGuides(group.content).find((guide) => containsPoint(guide.rect, point))?.zone;
    return zone && changesLayout(subject, group, zone) ? { type: 'group', groupId: group.id, zone } : undefined;
  }

  return undefined;
}

/** Guide squares, in px. */
const GUIDE_SIZE = 32;
const GUIDE_GAP = 4;

/**
 * Five guide squares arranged as a cross around the centre of `rect`, in the same
 * space as `rect`. Render them to show where {@link findGuideDropTarget} drops.
 */
export function dockGuides(rect: DockRect): { zone: DockZone; rect: DockRect }[] {
  const cx = rect.x + rect.width / 2 - GUIDE_SIZE / 2;
  const cy = rect.y + rect.height / 2 - GUIDE_SIZE / 2;
  const step = GUIDE_SIZE + GUIDE_GAP;
  const square = (x: number, y: number): DockRect => ({ x, y, width: GUIDE_SIZE, height: GUIDE_SIZE });

  return [
    { zone: 'center', rect: square(cx, cy) },
    { zone: 'left', rect: square(cx - step, cy) },
    { zone: 'right', rect: square(cx + step, cy) },
    { zone: 'top', rect: square(cx, cy - step) },
    { zone: 'bottom', rect: square(cx, cy + step) }
  ];
}

/** One guide square in the middle of each edge of `rect`, inset by 12 px. */
export function dockRootGuides(rect: DockRect): { edge: DockEdge; rect: DockRect }[] {
  const inset = 12;
  const midX = rect.x + rect.width / 2 - GUIDE_SIZE / 2;
  const midY = rect.y + rect.height / 2 - GUIDE_SIZE / 2;
  const square = (x: number, y: number): DockRect => ({ x, y, width: GUIDE_SIZE, height: GUIDE_SIZE });

  return [
    { edge: 'left', rect: square(rect.x + inset, midY) },
    { edge: 'right', rect: square(rect.x + rect.width - inset - GUIDE_SIZE, midY) },
    { edge: 'top', rect: square(midX, rect.y + inset) },
    { edge: 'bottom', rect: square(midX, rect.y + rect.height - inset - GUIDE_SIZE) }
  ];
}

/** Whether two targets describe the same drop. */
export function sameDropTarget(left: DockDropTarget | undefined, right: DockDropTarget | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }

  if (left.type === 'root') {
    return right.type === 'root' && left.edge === right.edge;
  }

  if (right.type === 'root') {
    return false;
  }

  return left.groupId === right.groupId && left.zone === right.zone && left.index === right.index;
}

/**
 * Whether dropping on `zone` of `group` changes anything: a group cannot drop on
 * itself, and a panel cannot merge into its own group or split off as the
 * group's only panel. Use it to hide drop affordances that would do nothing.
 */
export function changesLayout(
  subject: DockDragSubject,
  group: Pick<DockGroupGeometry, 'id' | 'panels'>,
  zone: DockZone
): boolean {
  if (subject.groupId !== group.id) {
    return true;
  }

  return subject.type === 'panel' && zone !== 'center' && group.panels.length > 1;
}

/**
 * Splits a rectangle into five zones: edge bands take 25% of the side (between
 * 24 and 80 px), the middle is `center`.
 */
export function dropZone(rect: DockRect, point: DockPoint): DockZone {
  const bandX = clamp(rect.width * 0.25, 24, 80);
  const bandY = clamp(rect.height * 0.25, 24, 80);
  const left = point.x - rect.x;
  const right = rect.x + rect.width - point.x;
  const top = point.y - rect.y;
  const bottom = rect.y + rect.height - point.y;
  const nearest = Math.min(left / bandX, right / bandX, top / bandY, bottom / bandY);

  if (nearest >= 1) {
    return 'center';
  }
  if (nearest === left / bandX) {
    return 'left';
  }
  if (nearest === right / bandX) {
    return 'right';
  }
  return nearest === top / bandY ? 'top' : 'bottom';
}

/** Returns the insertion index among the group's tabs, ignoring the dragged tab. */
export function tabInsertionIndex(group: DockGroupGeometry, draggedId: PanelId | undefined, point: DockPoint): number {
  const others = group.panels.filter((panelId) => panelId !== draggedId);
  const index = others.findIndex((panelId) => {
    const rect = group.tabs.get(panelId);
    return rect !== undefined && point.x < rect.x + rect.width / 2;
  });
  return index === -1 ? others.length : index;
}

/**
 * Rectangle that previews a drop, relative to the same origin as the inputs.
 *
 * Edge zones cover half of the group, root edges a quarter of the dock, and a tab
 * insertion is a 2 px line before the tab at `index` (counted without `draggedId`).
 */
export function dropPreviewRect(
  target: DockDropTarget,
  root: DockRect,
  group: DockGroupGeometry | undefined,
  draggedId?: PanelId
): DockRect | undefined {
  if (target.type === 'root') {
    return edgeSlice(root, target.edge, 0.25);
  }

  if (!group) {
    return undefined;
  }

  if (target.zone === 'center' && target.index !== undefined && group.tabList) {
    return tabInsertionLine(group, target.index, group.tabList, draggedId);
  }

  if (!group.content) {
    return undefined;
  }

  return target.zone === 'center' ? group.content : edgeSlice(group.content, target.zone, 0.5);
}

/** Dock edge bands narrower than this belong to the root target. */
const ROOT_EDGE_BAND_PX = 12;

function tabInsertionLine(
  group: DockGroupGeometry,
  index: number,
  tabList: DockRect,
  draggedId: PanelId | undefined
): DockRect {
  const rects = group.panels
    .filter((panelId) => panelId !== draggedId)
    .map((panelId) => group.tabs.get(panelId))
    .filter((rect) => rect !== undefined);
  const next = rects[index];
  const previous = rects[index - 1];
  const x = next ? next.x : previous ? previous.x + previous.width : tabList.x;
  return { x: x - 1, y: tabList.y, width: 2, height: tabList.height };
}

function edgeSlice(rect: DockRect, edge: DockEdge, share: number): DockRect {
  switch (edge) {
    case 'left':
      return { ...rect, width: rect.width * share };
    case 'right':
      return { ...rect, x: rect.x + rect.width * (1 - share), width: rect.width * share };
    case 'top':
      return { ...rect, height: rect.height * share };
    case 'bottom':
      return { ...rect, y: rect.y + rect.height * (1 - share), height: rect.height * share };
  }
}

function edgeBand(rect: DockRect, point: DockPoint, band: number): DockEdge | undefined {
  if (point.x < rect.x + band) {
    return 'left';
  }
  if (point.x > rect.x + rect.width - band) {
    return 'right';
  }
  if (point.y < rect.y + band) {
    return 'top';
  }
  if (point.y > rect.y + rect.height - band) {
    return 'bottom';
  }
  return undefined;
}

/** Whether `point` lies inside `rect`, edges included. */
export function containsPoint(rect: DockRect, point: DockPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
