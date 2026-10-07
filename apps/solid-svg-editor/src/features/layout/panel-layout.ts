/** A part of the editor that GodSVG's layout places: the canvas stays on the right, these share the left column. */
export type LayoutPart = 'inspector' | 'code' | 'previews';

/** Every layout part, in GodSVG's order. */
export const layoutParts: readonly LayoutPart[] = ['inspector', 'code', 'previews'];

/**
 * GodSVG's layout: the parts in the top-left and bottom-left sections (each shows its parts as tabs) and the excluded
 * ones. The top section is never empty while the bottom one has parts. `split` is the top section's share of the
 * column's height when both are shown.
 */
export type PanelLayout = {
  readonly top: readonly LayoutPart[];
  readonly bottom: readonly LayoutPart[];
  readonly excluded: readonly LayoutPart[];
  readonly split: number;
};

/** Where a dragged part lands: inside a section at an index, or as the only part of a new top or bottom section. */
export type LayoutDrop =
  | { readonly kind: 'inside'; readonly section: 'top' | 'bottom' | 'excluded'; readonly index: number }
  | { readonly kind: 'above' }
  | { readonly kind: 'below' };

/** GodSVG's default: Inspector and Code Editor on top, Previews excluded. */
export function defaultPanelLayout(): PanelLayout {
  return { top: ['inspector', 'code'], bottom: [], excluded: ['previews'], split: 0.5 };
}

/**
 * Moves a part like GodSVG's layout popup. Above/below make the part the only one in a new top/bottom section, moving
 * the parts of a lone section to the other side; they need one side free. Returns `undefined` for drops GodSVG
 * refuses: splitting when both sections are taken, or excluding the last shown part.
 */
export function movePart(layout: PanelLayout, part: LayoutPart, drop: LayoutDrop): PanelLayout | undefined {
  const without = (parts: readonly LayoutPart[]) => parts.filter((item) => item !== part);
  let top = without(layout.top);
  let bottom = without(layout.bottom);
  let excluded = without(layout.excluded);

  if (drop.kind === 'inside') {
    const from = layout[drop.section].indexOf(part);
    const target = drop.section === 'top' ? top : drop.section === 'bottom' ? bottom : excluded;
    const index = Math.min(target.length, from !== -1 && from < drop.index ? drop.index - 1 : drop.index);
    const placed = [...target.slice(0, index), part, ...target.slice(index)];

    if (drop.section === 'top') {
      top = placed;
    } else if (drop.section === 'bottom') {
      bottom = placed;
    } else {
      excluded = placed;
    }
  } else if (drop.kind === 'above') {
    if (top.length > 0 && bottom.length > 0) {
      return undefined;
    }

    bottom = top.length > 0 ? top : bottom;
    top = [part];
  } else {
    if (top.length > 0 && bottom.length > 0) {
      return undefined;
    }

    top = top.length > 0 ? top : bottom;
    bottom = [part];
  }

  if (top.length === 0 && bottom.length === 0) {
    return undefined;
  }

  return top.length === 0 ? { top: bottom, bottom: [], excluded, split: layout.split } : { top, bottom, excluded, split: layout.split };
}

/** Reads a stored layout: unknown or repeated parts are dropped, missing ones excluded, and an empty one is reset. */
export function restorePanelLayout(stored: unknown): PanelLayout {
  const value = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Record<keyof PanelLayout, unknown>>;
  const seen = new Set<LayoutPart>();
  const parts = (list: unknown): LayoutPart[] =>
    (Array.isArray(list) ? list : []).filter((item): item is LayoutPart => {
      if (!layoutParts.includes(item as LayoutPart) || seen.has(item as LayoutPart)) {
        return false;
      }

      seen.add(item as LayoutPart);
      return true;
    });
  const top = parts(value.top);
  const bottom = parts(value.bottom);
  const excluded = [...parts(value.excluded), ...layoutParts.filter((part) => !seen.has(part))];
  const split = typeof value.split === 'number' && value.split > 0.1 && value.split < 0.9 ? value.split : 0.5;

  if (top.length === 0 && bottom.length === 0) {
    return defaultPanelLayout();
  }

  return top.length === 0 ? { top: bottom, bottom: [], excluded, split } : { top, bottom, excluded, split };
}
