import { createRoot } from 'solid-js';
import { Container } from 'src/BlockTree';
import { calculateLayout } from 'src/calculateLayout';
import { createBlockItemId, createPlaceholderItemId, ItemId } from 'src/Item';
import { BlockMeasurements } from 'src/measure';
import { VirtualTree } from 'src/virtual-tree';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Test Helpers
// ============================================================================

type TestBlock = { key: string; tag?: string; containers?: Container<string, TestBlock>[] };

function block(key: string, tag?: string): TestBlock {
  return { key, tag };
}

function group(key: string, children: TestBlock[], accepts: string[] = []): TestBlock {
  const container: Container<string, TestBlock> = {
    key,
    spacing: 4,
    accepts,
    getBlocks: () => children
  };
  return { key, tag: 'group', containers: [container] };
}

function buildTree(rootChildren: TestBlock[], accepts: string[] = ['group', 'brush']): VirtualTree<string, TestBlock> {
  let tree!: VirtualTree<string, TestBlock>;

  createRoot((dispose) => {
    const root: Container<string, TestBlock> = {
      key: 'root',
      spacing: 4,
      accepts,
      getBlocks: () => rootChildren
    };

    const accessor = VirtualTree.create<string, TestBlock>(
      () => root,
      (b) => b.key,
      (b) => ({ tag: b.tag }),
      (b) => b.containers ?? []
    );

    tree = accessor();
    dispose();
  });

  return tree;
}

/**
 * Creates a simple measurement map where each block is 30px tall
 * and positioned at consecutive heights inside the root container.
 */
function createSimpleMeasurements(
  tree: VirtualTree<string, TestBlock>,
  blockHeight: number = 30,
  containerWidth: number = 200
): Map<ItemId, BlockMeasurements> {
  const measures = new Map<ItemId, BlockMeasurements>();

  // Root container measurement
  const rootChildren = tree.children(tree.root.id).filter((c) => c.kind === 'block');
  const spacing = tree.root.spacing;
  const totalHeight = rootChildren.length * blockHeight + (rootChildren.length - 1) * spacing;

  measures.set(tree.root.id, {
    container: new DOMRect(0, 0, containerWidth, totalHeight),
    children: rootChildren.map((child, i) => ({
      x: 0,
      y: i * (blockHeight + spacing),
      w: 0,
      id: child.id
    })),
    bottom: 0
  });

  // Each block measurement (flat, no nested containers)
  for (const child of rootChildren) {
    measures.set(child.id, {
      container: new DOMRect(0, 0, containerWidth, blockHeight),
      children: [],
      bottom: blockHeight
    });
  }

  return measures;
}

// ============================================================================
// MARK: calculateLayout
// ============================================================================

describe('calculateLayout', () => {
  it('computes layout rects for a flat list of blocks', () => {
    const tree = buildTree([block('a'), block('b'), block('c')]);
    const measures = createSimpleMeasurements(tree);
    const layout = calculateLayout(tree, (id) => measures.get(id));

    // Check that every block has a rect
    const rectA = layout.get(createBlockItemId('a'));
    const rectB = layout.get(createBlockItemId('b'));
    const rectC = layout.get(createBlockItemId('c'));

    expect(rectA).toBeDefined();
    expect(rectB).toBeDefined();
    expect(rectC).toBeDefined();

    // Blocks should be positioned vertically with spacing
    expect(rectA!.y).toBe(0);
    expect(rectB!.y).toBeGreaterThan(rectA!.y);
    expect(rectC!.y).toBeGreaterThan(rectB!.y);
  });

  it('includes the root container in the layout', () => {
    const tree = buildTree([block('a')]);
    const measures = createSimpleMeasurements(tree);
    const layout = calculateLayout(tree, (id) => measures.get(id));

    const rootRect = layout.get(tree.root.id);
    expect(rootRect).toBeDefined();
  });

  it('accounts for spacing between blocks', () => {
    const tree = buildTree([block('a'), block('b')]);
    const blockHeight = 30;
    const measures = createSimpleMeasurements(tree, blockHeight);
    const layout = calculateLayout(tree, (id) => measures.get(id));

    const rectA = layout.get(createBlockItemId('a'))!;
    const rectB = layout.get(createBlockItemId('b'))!;

    // B should start at A's bottom + spacing (4px)
    expect(rectB.y).toBe(rectA.y + blockHeight + 4);
  });

  it('returns an empty layout when the tree has no blocks', () => {
    const tree = buildTree([]);
    const measures = createSimpleMeasurements(tree);
    const layout = calculateLayout(tree, (id) => measures.get(id));

    // Should still have the root and placeholder
    expect(layout.size).toBeGreaterThan(0);
  });

  it('computes a placeholder rect for wrap-layout containers', () => {
    // Build a tree with a wrap-layout root
    let tree!: VirtualTree<string, TestBlock>;
    createRoot((dispose) => {
      const root: Container<string, TestBlock> = {
        key: 'root',
        spacing: 4,
        accepts: ['brush'],
        layout: 'wrap',
        getBlocks: () => [block('a', 'brush'), block('b', 'brush'), block('c', 'brush')]
      };
      const accessor = VirtualTree.create<string, TestBlock>(
        () => root,
        (b) => b.key,
        (b) => ({ tag: b.tag }),
        (b) => b.containers ?? []
      );
      tree = accessor();
      dispose();
    });

    const childW = 80;
    const childH = 60;
    const spacing = 4;
    const containerW = 300;
    const measures = new Map<ItemId, BlockMeasurements>();

    // Simulate 3 children laid out horizontally: [a @ 0] [b @ 84] [c @ 168]
    const children = tree.children(tree.root.id).filter((c) => c.kind === 'block');
    let cx = 0;
    for (const child of children) {
      measures.set(child.id, {
        container: new DOMRect(cx, 0, childW, childH),
        children: [],
        bottom: childH
      });
      cx += childW + spacing;
    }
    measures.set(tree.root.id, {
      container: new DOMRect(0, 0, containerW, childH),
      children: [],
      bottom: 0
    });

    const layout = calculateLayout(tree, (id) => measures.get(id));

    const placeholderId = createPlaceholderItemId('root');
    const placeholderRect = layout.get(placeholderId);

    expect(placeholderRect).toBeDefined();
    // c is at x=168, width=80 → right edge at 248. Placeholder at 248 + spacing = 252
    expect(placeholderRect!.x).toBe(248 + spacing);
    expect(placeholderRect!.y).toBe(0);
    expect(placeholderRect!.width).toBe(childW);
    expect(placeholderRect!.height).toBe(childH);
  });

  it('computes a placeholder rect at origin for an empty wrap container', () => {
    let tree!: VirtualTree<string, TestBlock>;
    createRoot((dispose) => {
      const root: Container<string, TestBlock> = {
        key: 'root',
        spacing: 4,
        accepts: ['brush'],
        layout: 'wrap',
        getBlocks: () => []
      };
      const accessor = VirtualTree.create<string, TestBlock>(
        () => root,
        (b) => b.key,
        (b) => ({ tag: b.tag }),
        (b) => b.containers ?? []
      );
      tree = accessor();
      dispose();
    });

    const measures = new Map<ItemId, BlockMeasurements>();
    measures.set(tree.root.id, {
      container: new DOMRect(0, 0, 300, 0),
      children: [],
      bottom: 0
    });

    const layout = calculateLayout(tree, (id) => measures.get(id));

    const placeholderId = createPlaceholderItemId('root');
    const placeholderRect = layout.get(placeholderId);

    expect(placeholderRect).toBeDefined();
    expect(placeholderRect!.x).toBe(0);
    expect(placeholderRect!.y).toBe(0);
  });
});
