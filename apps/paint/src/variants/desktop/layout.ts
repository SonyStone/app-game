// The Desktop variant's workspace layout as it is remembered in `localStorage`: the dock's width and side, and each
// dock panel's height and whether it is collapsed. Pure functions; `createWorkspace` owns the reactive state.

/** The panels of the dock, top to bottom. */
export const panelIds = ['color', 'brushes', 'layers'] as const;

/** A panel of the dock. */
export type PanelId = (typeof panelIds)[number];

/** The remembered workspace layout. */
export type WorkspaceLayout = {
  /** The dock's width in CSS pixels; see {@link clampDockWidth}. */
  width: number;
  /**
   * Which side the dock is on; the tool column takes the other one. `right` (default) suits a left hand, whose palm
   * rests left of the pen; `left` suits a right hand.
   */
  dock: 'left' | 'right';
  /** Panel heights in CSS pixels, used as flex weights, so that the panels share the dock's height in proportion. */
  sizes: Record<PanelId, number>;
  /** Collapsed panels show only their header. */
  collapsed: Record<PanelId, boolean>;
};

/** The layout of a first start, and of View › Reset panel layout. */
export function defaultLayout(): WorkspaceLayout {
  return {
    width: 284,
    dock: 'right',
    sizes: { color: 336, brushes: 220, layers: 240 },
    collapsed: { color: false, brushes: false, layers: false }
  };
}

/** Reads a stored layout, keeping valid fields and filling the rest from {@link defaultLayout}. */
export function readLayout(text: string | null): WorkspaceLayout {
  const fallback = defaultLayout();
  let stored: unknown;
  try {
    stored = JSON.parse(text ?? '{}');
  } catch {
    return fallback;
  }

  if (typeof stored !== 'object' || stored === null) {
    return fallback;
  }

  const record = stored as Partial<Record<keyof WorkspaceLayout, unknown>>;
  const sizes = (record.sizes ?? {}) as Partial<Record<PanelId, unknown>>;
  const collapsed = (record.collapsed ?? {}) as Partial<Record<PanelId, unknown>>;
  return {
    width:
      typeof record.width === 'number' && Number.isFinite(record.width) ? clampDockWidth(record.width) : fallback.width,
    dock: record.dock === 'left' ? 'left' : 'right',
    sizes: Object.fromEntries(
      panelIds.map((id) => {
        const size = sizes[id];
        return [id, typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : fallback.sizes[id]];
      })
    ) as Record<PanelId, number>,
    collapsed: Object.fromEntries(panelIds.map((id) => [id, collapsed[id] === true])) as Record<PanelId, boolean>
  };
}

/** Limits the dock's width to 220–480 CSS pixels. */
export function clampDockWidth(width: number) {
  return Math.round(Math.min(maxDockWidth, Math.max(minDockWidth, width)));
}

const minDockWidth = 220;
const maxDockWidth = 480;

/**
 * The two panels a sash below panel `index` resizes: the nearest expanded panel at or above it and the nearest
 * expanded panel below it. Collapsed panels between them keep their header height. `undefined` when either side has
 * no expanded panel, so the sash cannot resize anything.
 */
export function sashPair(collapsed: Record<PanelId, boolean>, index: number): [PanelId, PanelId] | undefined {
  const above = panelIds
    .slice(0, index + 1)
    .filter((id) => !collapsed[id])
    .at(-1);
  const below = panelIds.slice(index + 1).find((id) => !collapsed[id]);
  return above && below ? [above, below] : undefined;
}

/**
 * Moves the boundary between panels `above` and `below` by `delta` CSS pixels, starting from their measured
 * `heights`, so that their sum stays and neither gets smaller than `min`. Returns the two new heights.
 */
export function resizePair(heights: { above: number; below: number }, delta: number, min: number) {
  const total = heights.above + heights.below;
  const above = Math.min(total - min, Math.max(min, heights.above + delta));
  // Two panels too small to share `min` keep their heights.
  if (total < min * 2) {
    return heights;
  }

  return { above, below: total - above };
}
