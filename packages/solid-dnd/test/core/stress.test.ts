import { getGridInsertionPoint } from 'src/core/gridInsertion';
import { type ResolvedGrid } from 'src/core/gridLayout';
import * as Rect from 'src/core/rect';
import { reorderItems } from 'src/core/reorder';
import * as Tree from 'src/core/tree';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

type Item = { id: string };

const getKey = (i: Item) => i.id;

/** Generate `n` items with sequential ids. */
function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}` }));
}

/** Build item rects for a grid. */
function makeGridRects(keys: string[], columns: number): Map<string, Rect.Rect> {
  const rects = new Map<string, Rect.Rect>();
  const cellW = 100;
  const cellH = 80;
  const gap = 8;
  keys.forEach((key, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    rects.set(key, Rect.of(col * (cellW + gap), row * (cellH + gap), cellW, cellH));
  });
  return rects;
}

/** Build a Tree (Record) from a map. */
function makeTree(entries: [string, string[]][]): Tree.Tree {
  const tree: Record<string, string[]> = {};
  for (const [key, children] of entries) {
    tree[key] = children;
  }
  return tree as Tree.Tree;
}

// ============================================================================
// MARK: Stress tests
// ============================================================================

describe('stress: reorderItems', () => {
  it('handles 1,000 items — single move', () => {
    const items = makeItems(1000);
    const result = reorderItems(items, ['item-999'], { parent: 'list', before: 'item-0' }, getKey);
    expect(result[0].id).toBe('item-999');
    expect(result[1].id).toBe('item-0');
    expect(result.length).toBe(1000);
  });

  it('handles 1,000 items — move 100 items at once', () => {
    const items = makeItems(1000);
    const toMove = items.slice(500, 600).map((i) => i.id);
    const result = reorderItems(items, toMove, { parent: 'list', before: 'item-0' }, getKey);
    expect(result.length).toBe(1000);
    expect(result[0].id).toBe('item-500');
    expect(result[99].id).toBe('item-599');
    expect(result[100].id).toBe('item-0');
  });

  it('handles 1,000 items — move using Set', () => {
    const items = makeItems(1000);
    const toMove = new Set(items.slice(0, 50).map((i) => i.id));
    const result = reorderItems(items, toMove, { parent: 'list', before: null }, getKey);
    expect(result.length).toBe(1000);
    expect(result[950].id).toBe('item-0');
    expect(result[999].id).toBe('item-49');
  });

  it('50 rapid-fire sequential reorders produce correct final state', () => {
    let items = makeItems(20);
    // Move first item to end, 50 times — equivalent to rotating left 50 times
    for (let i = 0; i < 50; i++) {
      const firstId = items[0].id;
      items = reorderItems(items, [firstId], { parent: 'list', before: null }, getKey);
    }
    expect(items.length).toBe(20);
    // 50 % 20 = 10 rotations → item-10 should be first
    expect(items[0].id).toBe('item-10');
    expect(items[19].id).toBe('item-9');
  });
});

describe('stress: reorder — large lists', () => {
  it('handles moving the same item back and forth 100 times', () => {
    let items = makeItems(50);
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        items = reorderItems(items, ['item-25'], { parent: 'list', before: 'item-0' }, getKey);
      } else {
        items = reorderItems(items, ['item-25'], { parent: 'list', before: null }, getKey);
      }
    }
    expect(items.length).toBe(50);
    // Last operation was append (i=99, odd)
    expect(items[items.length - 1].id).toBe('item-25');
  });

  it('bulk-moves 200 items into the middle of a 1,000 item list', () => {
    const items = makeItems(1000);
    const toMove = items.slice(800, 1000).map((i) => i.id);
    const result = reorderItems(items, toMove, { parent: 'list', before: 'item-400' }, getKey);
    expect(result.length).toBe(1000);
    // item-800 should be right before item-400
    const idx800 = result.findIndex((i) => i.id === 'item-800');
    const idx400 = result.findIndex((i) => i.id === 'item-400');
    expect(idx800).toBeLessThan(idx400);
    expect(idx400 - idx800).toBe(200); // 200 moved items between them
  });
});

describe('stress: grid insertion — large grids', () => {
  it('computes insertion point for 200-item grid (10 cols)', () => {
    const items = makeItems(200);
    const keys = items.map((i) => i.id);
    const columns = 10;
    const rects = makeGridRects(keys, columns);
    const grid: ResolvedGrid = {
      columns,
      columnWidth: 100,
      rowHeight: 80,
      rowGap: 8,
      colGap: 8,
      rows: 20
    };
    const containerRect = Rect.of(0, 0, columns * 108, 20 * 88);

    const result = getGridInsertionPoint({ x: 5 * 108 + 50, y: 10 * 88 + 40 }, 'grid', keys, grid, containerRect, (k) =>
      rects.get(k)
    );

    expect(result).toBeDefined();
    expect(result!.parent).toBe('grid');
  });

  it('handles degenerate grid: 1 column, 500 rows', () => {
    const items = makeItems(500);
    const keys = items.map((i) => i.id);
    const columns = 1;
    const rects = makeGridRects(keys, columns);
    const grid: ResolvedGrid = {
      columns: 1,
      columnWidth: 100,
      rowHeight: 80,
      rowGap: 8,
      colGap: 0,
      rows: 500
    };
    const containerRect = Rect.of(0, 0, 100, 500 * 88);

    const result = getGridInsertionPoint({ x: 50, y: 250 * 88 + 40 }, 'grid', keys, grid, containerRect, (k) =>
      rects.get(k)
    );

    expect(result).toBeDefined();
  });

  it('handles degenerate grid: 100 columns, 1 row', () => {
    const items = makeItems(100);
    const keys = items.map((i) => i.id);
    const grid: ResolvedGrid = {
      columns: 100,
      columnWidth: 50,
      rowHeight: 80,
      rowGap: 0,
      colGap: 4,
      rows: 1
    };
    const containerRect = Rect.of(0, 0, 100 * 54, 80);

    const result = getGridInsertionPoint({ x: 50 * 54 + 25, y: 40 }, 'grid', keys, grid, containerRect, (k) =>
      makeGridRects(keys, 100).get(k)
    );

    expect(result).toBeDefined();
  });
});

describe('stress: Tree operations', () => {
  it('handles tree with 100 containers, 10 items each', () => {
    const entries: [string, string[]][] = [];
    const rootChildren: string[] = [];

    for (let g = 0; g < 100; g++) {
      const groupId = `group-${g}`;
      rootChildren.push(groupId);
      const children: string[] = [];
      for (let i = 0; i < 10; i++) {
        children.push(`${groupId}-item-${i}`);
      }
      entries.push([groupId, children]);
    }
    entries.push(['root', rootChildren]);
    const tree = makeTree(entries);

    const result = Tree.move(tree, 'group-50-item-5', { parent: 'group-0', before: 'group-0-item-0' });

    expect(result['group-0']).toContain('group-50-item-5');
    expect(result['group-50']).not.toContain('group-50-item-5');
    expect(result['group-0'][0]).toBe('group-50-item-5');
  });

  it('parentMap handles 1,000 total nodes', () => {
    const entries: [string, string[]][] = [];
    const rootChildren: string[] = [];

    for (let g = 0; g < 50; g++) {
      const groupId = `g${g}`;
      rootChildren.push(groupId);
      entries.push([groupId, Array.from({ length: 20 }, (_, i) => `${groupId}-${i}`)]);
    }
    entries.push(['root', rootChildren]);
    const tree = makeTree(entries);

    const parents = Tree.parentMap(tree);
    expect(parents.size).toBe(50 + 50 * 20); // 50 groups + 1000 items
    expect(parents.get('g25-10')).toBe('g25');
    expect(parents.get('g0')).toBe('root');
  });

  it('rapid-fire tree moves maintain consistency', () => {
    let tree: Tree.Tree = makeTree([
      ['root', ['a', 'b', 'c']],
      ['a', ['a1', 'a2', 'a3']],
      ['b', ['b1', 'b2', 'b3']],
      ['c', ['c1', 'c2', 'c3']]
    ]);

    // 30 rapid moves between containers
    for (let i = 0; i < 30; i++) {
      const containers = ['a', 'b', 'c'];
      const source = containers[i % 3];
      const target = containers[(i + 1) % 3];
      const sourceChildren = tree[source as keyof typeof tree] ?? [];
      if (sourceChildren.length > 0) {
        const item = sourceChildren[0];
        tree = Tree.move(tree, item, { parent: target, before: null });
      }
    }

    // All items should still exist somewhere
    const allItems = new Set<string>();
    for (const key of Object.keys(tree)) {
      for (const child of tree[key as keyof typeof tree]) {
        allItems.add(child);
      }
    }
    // Original 12 items: a, b, c, a1-a3, b1-b3, c1-c3
    expect(allItems.size).toBe(12);
  });
});
