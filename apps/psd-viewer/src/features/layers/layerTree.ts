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

/** Flat panel rows retain ancestry for search, keyboard navigation and solo. */
export function layerRows(
  nodes: readonly PsdLayerNode[],
  ancestors: PsdLayerNode[] = []
): { node: PsdLayerNode; ancestors: PsdLayerNode[] }[] {
  return topFirst(nodes).flatMap((node) => [
    { node, ancestors },
    ...layerRows(node.children ?? [], [...ancestors, node])
  ]);
}

/** Search retains matching records and their ancestor groups, ignoring collapse while filtering. */
export function filteredRows(nodes: readonly PsdLayerNode[], collapsed: ReadonlySet<number>, query: string, kind = '') {
  const rows = layerRows(nodes);
  const searching = Boolean(query.trim() || kind);
  const matches = rows.filter(
    ({ node }) =>
      node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!kind || node.kind === kind)
  );
  const included = new Set(
    matches.flatMap(({ node, ancestors }) => [node.index, ...ancestors.map((parent) => parent.index)])
  );
  return rows.filter(({ node, ancestors }) =>
    searching ? included.has(node.index) : ancestors.every((parent) => !collapsed.has(parent.index))
  );
}

/** Union of nonempty saved-record bounds; state transforms are not inferred. */
export function contentBounds(nodes: readonly PsdLayerNode[]) {
  const bounds = layerRows(nodes)
    .map(({ node }) => node.bounds)
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
  return bounds.length
    ? {
        left: Math.min(...bounds.map((rect) => rect.left)),
        top: Math.min(...bounds.map((rect) => rect.top)),
        right: Math.max(...bounds.map((rect) => rect.right)),
        bottom: Math.max(...bounds.map((rect) => rect.bottom))
      }
    : undefined;
}

/** What the viewer shows for 3D and video layers. */
const pixelSourceNotes = {
  '3d': 'a 3D layer: shown as the pixels Photoshop saved; the 3D scene is not rendered',
  video: 'a video layer: shown as the frame Photoshop saved; the footage is not played'
} as const;
