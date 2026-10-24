import type { PsdLayerNode } from '@app-game/psd/viewer';

/** Nodes top first, as a layers panel lists them; the document stores them bottom first. */
export function topFirst(nodes: readonly PsdLayerNode[]): PsdLayerNode[] {
  return [...nodes].reverse();
}

/** A layer's note with the layer it belongs to, for document-wide lists. */
export type LayerNote = { index: number; name: string; note: string };

/**
 * Every note of every layer and group, top first, in panel order, with a note for each 3D and video layer, whose scene
 * or footage is not rendered.
 */
export function collectNotes(nodes: readonly PsdLayerNode[]): LayerNote[] {
  return topFirst(nodes).flatMap((node) => [
    ...(node.pixelSource ? [{ index: node.index, name: node.name, note: pixelSourceNotes[node.pixelSource] }] : []),
    ...node.notes.map((note) => ({ index: node.index, name: node.name, note })),
    ...collectNotes(node.children ?? [])
  ]);
}

/** The indices of groups Photoshop's Layers panel shows collapsed. */
export function collapsedGroups(nodes: readonly PsdLayerNode[]): number[] {
  return nodes.flatMap((node) => [
    ...(node.children && !node.open ? [node.index] : []),
    ...collapsedGroups(node.children ?? [])
  ]);
}

/** The node of record `index`, searching groups. */
export function findLayer(nodes: readonly PsdLayerNode[], index: number): PsdLayerNode | undefined {
  for (const node of nodes) {
    const found = node.index === index ? node : findLayer(node.children ?? [], index);
    if (found) {
      return found;
    }
  }

  return undefined;
}

/** Effective visibility of a record, including every parent group; undefined if the record is absent. */
export function layerVisibility(
  nodes: readonly PsdLayerNode[],
  index: number,
  overrides: ReadonlyMap<number, boolean>
): boolean | undefined {
  for (const node of nodes) {
    const visible = overrides.get(node.index) ?? node.visible;
    if (node.index === index) {
      return visible;
    }

    const child = layerVisibility(node.children ?? [], index, overrides);
    if (child !== undefined) {
      return visible && child;
    }
  }

  return undefined;
}

/** Short type labels for the panel's kind column. */
export const kindLabels: Record<PsdLayerNode['kind'], string> = {
  group: 'Group',
  adjustment: 'Adjustment',
  text: 'Type',
  smartObject: 'Smart Object',
  shape: 'Shape',
  fill: 'Fill',
  pixel: 'Pixels'
};

/** A byte opacity as a percentage, as Photoshop's panels show it. */
export function percent(byte: number): string {
  return `${Math.round((byte / 255) * 100)}%`;
}

/** What the viewer shows for 3D and video layers. */
const pixelSourceNotes = {
  '3d': 'a 3D layer: shown as the pixels Photoshop saved; the 3D scene is not rendered',
  video: 'a video layer: shown as the frame Photoshop saved; the footage is not played'
} as const;
