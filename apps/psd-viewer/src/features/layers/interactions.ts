import type { PsdExactRasterTreeEdit } from '@app-game/psd/editor';
import type { LayerEditing } from '../editing/Editing';

/** Saved sibling order is bottom first. Indices are invalidated by structural edits. */
export type EditableLayer = ReturnType<LayerEditing['layers']>[number];

/** Photoshop range selection uses the last unmodified click as its anchor. */
export function selectLayers(
  current: readonly number[],
  ordered: readonly number[],
  id: number,
  anchor: number | undefined,
  modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
): number[] {
  if (modifiers.shiftKey && anchor !== undefined && ordered.includes(anchor)) {
    const first = ordered.indexOf(anchor);
    const last = ordered.indexOf(id);
    return ordered.slice(Math.min(first, last), Math.max(first, last) + 1);
  }

  if (modifiers.metaKey || modifiers.ctrlKey) {
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  }

  return [id];
}

/** A horizontal scrub displays integer percentages; Shift accelerates by ten, as Photoshop does. */
export function scrubPercent(initial: number, distance: number, accelerated = false): number {
  return Math.max(0, Math.min(100, Math.round(initial + distance * (accelerated ? 10 : 1))));
}

/** Round percentage edits to the nearest stored opacity byte. */
export function opacityByte(percent: number): number {
  return Math.round((Math.max(0, Math.min(100, percent)) * 255) / 100);
}

/** Drop zones distinguish insertion lines from the middle of a group header. */
export function dropZone(fraction: number, group: boolean): 'before' | 'inside' | 'after' {
  if (group && fraction >= 0.25 && fraction <= 0.75) {
    return 'inside';
  }

  return fraction < 0.5 ? 'before' : 'after';
}

/** Removes selected descendants so structural gestures act on each subtree once. */
export function selectionRoots(layers: readonly EditableLayer[], ids: readonly number[]): EditableLayer[] {
  const selected = new Set(ids);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  return layers.filter((layer) => {
    if (!selected.has(layer.id)) {
      return false;
    }

    let parent = layer.parent;
    while (parent !== null) {
      if (selected.has(parent)) {
        return false;
      }
      parent = byId.get(parent)?.parent ?? null;
    }
    return true;
  });
}

/** Known structural constraints can be explained before asking the authoritative editor. */
export function groupUnavailable(layers: readonly EditableLayer[], ids: readonly number[]): string | undefined {
  const roots = selectionRoots(layers, ids);
  if (!roots.length) {
    return 'Select layers to group.';
  }
  if (roots.some((layer) => layer.parent !== roots[0]!.parent)) {
    return 'Grouping requires sibling layers.';
  }
  const siblings = layers.filter((layer) => layer.parent === roots[0]!.parent);
  const indices = roots.map((layer) => siblings.indexOf(layer));
  if (Math.max(...indices) - Math.min(...indices) + 1 !== roots.length) {
    return 'Grouping requires a contiguous selection.';
  }
  return undefined;
}

/** Translate a top-first panel drop to a post-removal bottom-first insertion index. Cycles refuse locally. */
export function moveDestination(
  layers: readonly EditableLayer[],
  ids: readonly number[],
  target: EditableLayer,
  zone: ReturnType<typeof dropZone>
): { parent: number | null; index: number } | undefined {
  const roots = selectionRoots(layers, ids);
  const moving = new Set(roots.map((layer) => layer.id));
  let ancestor: EditableLayer | undefined = target;
  while (ancestor) {
    if (moving.has(ancestor.id)) {
      return undefined;
    }
    ancestor = layers.find((layer) => layer.id === ancestor!.parent);
  }
  const parent = zone === 'inside' ? target.id : target.parent;
  const siblings = layers.filter((layer) => layer.parent === parent && !moving.has(layer.id));
  const index =
    zone === 'inside'
      ? siblings.length
      : siblings.findIndex((layer) => layer.id === target.id) + (zone === 'before' ? 1 : 0);
  return { parent, index };
}

/** Plan each post-removal index against the preceding move, preserving a multi-selection's stack order. */
export function moveCommands(
  layers: readonly EditableLayer[],
  ids: readonly number[],
  target: EditableLayer,
  zone: ReturnType<typeof dropZone>
): PsdExactRasterTreeEdit[] {
  const destination = moveDestination(layers, ids, target, zone);
  if (!destination) {
    return [];
  }
  const siblings = new Map<number | null, number[]>();
  for (const layer of layers) {
    const children = siblings.get(layer.parent) ?? [];
    children.push(layer.id);
    siblings.set(layer.parent, children);
  }
  const roots = selectionRoots(layers, ids);
  const ordered = zone === 'before' ? roots.reverse() : roots;
  return ordered.map((layer) => {
    const source = siblings.get(layer.parent)!;
    source.splice(source.indexOf(layer.id), 1);
    const children = siblings.get(destination.parent) ?? [];
    const index = zone === 'inside' ? children.length : children.indexOf(target.id) + (zone === 'before' ? 1 : 0);
    children.splice(index, 0, layer.id);
    siblings.set(destination.parent, children);
    return { kind: 'move', layerId: layer.id, parent: destination.parent, index };
  });
}
