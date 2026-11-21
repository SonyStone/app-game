import { describe, expect, it } from 'vitest';
import type { DocumentNode, Layer, LayerGroup } from './document';
import { flatLayerMove, MAX_FOLDER_DEPTH, orderLayerTree, shownLayers, siblingBelow, subtreeIds } from './layerTree';

describe('layer tree', () => {
  it('puts every folder right after its children, keeping the order of siblings', () => {
    const nodes = [
      group('g'),
      raster('top'),
      raster('a', 'g'),
      group('h', 'g'),
      raster('b', 'h'),
      raster('bottom'),
      raster('c', 'g')
    ];
    // Siblings keep their relative order: root g, top, bottom; in g: a, h, c; in h: b.
    expect(orderLayerTree(nodes).map((node) => node.id)).toEqual(['a', 'b', 'h', 'c', 'g', 'top', 'bottom']);
  });

  it('refuses repeated ids, parents that are missing or not folders, cycles and nesting too deep', () => {
    expect(() => orderLayerTree([raster('a'), raster('a')])).toThrow('Invalid layer identifiers');
    expect(() => orderLayerTree([raster('a', 'missing')])).toThrow('not a folder');
    expect(() => orderLayerTree([raster('a'), raster('b', 'a')])).toThrow('not a folder');
    expect(() => orderLayerTree([group('x', 'y'), group('y', 'x'), raster('a')])).toThrow('inside itself');

    const deep: DocumentNode[] = [];
    for (let depth = 0; depth <= MAX_FOLDER_DEPTH; depth++) {
      deep.push(group(`g${depth}`, depth ? `g${depth - 1}` : undefined));
    }
    expect(() => orderLayerTree(deep)).not.toThrow();
    expect(() => orderLayerTree([...deep, raster('a', `g${MAX_FOLDER_DEPTH}`)])).toThrow('nested at most');
  });

  it('lists a subtree and the sibling right below a node', () => {
    const nodes = orderLayerTree([raster('base'), group('g'), raster('a', 'g'), raster('b', 'g'), raster('top')]);
    expect(subtreeIds(nodes, 'g')).toEqual(['a', 'b', 'g']);
    expect(subtreeIds(nodes, 'top')).toEqual(['top']);
    expect(siblingBelow(nodes, 'top')?.id).toBe('g');
    expect(siblingBelow(nodes, 'b')?.id).toBe('a');
    expect(siblingBelow(nodes, 'a')).toBeUndefined();
    expect(siblingBelow(nodes, 'g')?.id).toBe('base');
  });
});

describe('shown layers', () => {
  it('are the same list without folders, and the same rasters in folders that change nothing', () => {
    const flat = [raster('a'), raster('b', undefined, { clipping: true })];
    expect(shownLayers(flat)).toBe(flat);

    const wrapped = orderLayerTree([group('g'), raster('a', 'g'), raster('b', 'g', { clipping: true })]);
    const shown = shownLayers(wrapped);
    expect(shown.map((layer) => [layer.id, layer.visible, !!layer.clipping])).toEqual([
      ['a', true, false],
      ['b', true, true]
    ]);
    expect(shown[0]).toBe(wrapped[0]);
  });

  it('hide everything inside a hidden folder, sharing the layers’ tiles', () => {
    const nodes = orderLayerTree([
      raster('under'),
      group('outer', undefined, { visible: false }),
      group('inner', 'outer'),
      raster('deep', 'inner'),
      raster('over')
    ]);
    const shown = shownLayers(nodes);
    expect(shown.map((layer) => [layer.id, layer.visible])).toEqual([
      ['under', true],
      ['deep', false],
      ['over', true]
    ]);
    expect(shown[1]!.tiles).toBe((nodes.find((node) => node.id === 'deep') as Layer).tiles);
  });

  it('resolve clipping among siblings: a folder below, or none, leaves a clipped layer unclipped', () => {
    const nodes = orderLayerTree([
      raster('base'),
      group('g'),
      raster('first', 'g', { clipping: true }),
      raster('second', 'g', { clipping: true }),
      raster('above', undefined, { clipping: true }),
      raster('onAbove', undefined, { clipping: true })
    ]);
    expect(shownLayers(nodes).map((layer) => [layer.id, !!layer.clipping])).toEqual([
      ['base', false],
      // The bottom layer of a folder has no base, so it shows unclipped and is the base of the one above it.
      ['first', false],
      ['second', true],
      // Right above a folder: clipping to a folder is not supported, so it shows unclipped and is a base itself.
      ['above', false],
      ['onAbove', true]
    ]);
  });
});

function raster(id: string, parentId?: string, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    name: id,
    visible: true,
    opacity: 1,
    blend: 'normal',
    tiles: new Map(),
    ...extra
  };
}

function group(id: string, parentId?: string, extra: Partial<LayerGroup> = {}): LayerGroup {
  return {
    kind: 'group',
    id,
    ...(parentId ? { parentId } : {}),
    name: id,
    visible: true,
    opacity: 1,
    blend: 'pass-through',
    ...extra
  };
}

describe('moves in a flat list of raster layers', () => {
  it('reorder without folders and relocate next to the new neighbour with them', () => {
    const flat = [raster('a'), raster('b'), raster('c')];
    expect(flatLayerMove(flat, 'a', 2)).toEqual({ type: 'reorder', id: 'a', index: 2 });
    expect(flatLayerMove(flat, 'a', 0)).toBeUndefined();
    expect(flatLayerMove(flat, 'a', 3)).toBeUndefined();

    const nodes = orderLayerTree([raster('a'), group('g'), raster('b', 'g'), raster('c', 'g'), raster('d')]);
    expect(flatLayerMove(nodes, 'a', 1)).toEqual({
      type: 'relocate',
      id: 'a',
      parentId: 'g',
      anchorId: 'c',
      side: 'below'
    });
    expect(flatLayerMove(nodes, 'a', 3)).toEqual({
      type: 'relocate',
      id: 'a',
      parentId: null,
      anchorId: 'd',
      side: 'above'
    });
    expect(flatLayerMove(nodes, 'd', 0)).toEqual({
      type: 'relocate',
      id: 'd',
      parentId: null,
      anchorId: 'a',
      side: 'below'
    });
  });
});
