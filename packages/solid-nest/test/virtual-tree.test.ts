import { createRoot } from 'solid-js';
import { Container } from 'src/BlockTree';
import { createBlockItemId, createContainerItemId } from 'src/Item';
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

// ============================================================================
// MARK: VirtualTree.create
// ============================================================================

describe('VirtualTree.create', () => {
  it('creates a tree with the correct root', () => {
    const tree = buildTree([block('a'), block('b')]);
    expect(tree.root.kind).toBe('container');
    expect(tree.root.key).toBe('root');
  });

  it('enumerates children of the root', () => {
    const tree = buildTree([block('a'), block('b'), block('c')]);
    const children = tree.children(tree.root.id);
    const blockChildren = children.filter((c) => c.kind === 'block');
    expect(blockChildren.map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });

  it('includes a placeholder at the end of each container', () => {
    const tree = buildTree([block('a')]);
    const children = tree.children(tree.root.id);
    const placeholder = children.find((c) => c.kind === 'placeholder');
    expect(placeholder).toBeDefined();
    expect(placeholder!.kind).toBe('placeholder');
  });

  it('creates nested containers for groups', () => {
    const child1 = block('child1');
    const parent = group('parent', [child1], ['brush']);
    const tree = buildTree([parent], ['group']);

    // Parent should be a block
    const parentItem = tree.findItemById(createBlockItemId('parent'));
    expect(parentItem).toBeDefined();
    expect(parentItem!.kind).toBe('block');

    // Parent's children should contain a container
    const parentChildren = tree.children(parentItem!.id);
    const containerChild = parentChildren.find((c) => c.kind === 'container');
    expect(containerChild).toBeDefined();

    // That container should have the child block
    const nestedChildren = tree.children(containerChild!.id);
    const nestedBlocks = nestedChildren.filter((c) => c.kind === 'block');
    expect(nestedBlocks.map((c) => c.key)).toEqual(['child1']);
  });
});

// ============================================================================
// MARK: findBlock
// ============================================================================

describe('VirtualTree.findBlock', () => {
  it('finds a top-level block', () => {
    const a = block('a');
    const tree = buildTree([a, block('b')]);
    expect(tree.findBlock('a')).toBe(a);
  });

  it('returns undefined for non-existent keys', () => {
    const tree = buildTree([block('a')]);
    expect(tree.findBlock('nope')).toBeUndefined();
  });

  it('finds a nested block', () => {
    const child = block('nested');
    const parent = group('parent', [child], ['brush']);
    const tree = buildTree([parent], ['group']);
    expect(tree.findBlock('nested')).toBe(child);
  });
});

// ============================================================================
// MARK: containsChildBlock
// ============================================================================

describe('VirtualTree.containsChildBlock', () => {
  const child1 = block('child1');
  const child2 = block('child2');
  const parent = group('parent', [child1, child2], ['brush']);
  const tree = buildTree([parent, block('sibling')], ['group', 'brush']);

  it('returns true for a direct child', () => {
    expect(tree.containsChildBlock('parent', 'child1')).toBe(true);
  });

  it('returns true when checking a block against itself', () => {
    expect(tree.containsChildBlock('parent', 'parent')).toBe(true);
  });

  it('returns false for a sibling', () => {
    expect(tree.containsChildBlock('parent', 'sibling')).toBe(false);
  });
});

// ============================================================================
// MARK: extractBlocks
// ============================================================================

describe('VirtualTree.extractBlocks', () => {
  it('creates a tree with only the specified blocks as root children', () => {
    const tree = buildTree([block('a'), block('b'), block('c')]);
    const extracted = tree.extractBlocks(['b']);

    const children = extracted.children(extracted.root.id);
    const blockChildren = children.filter((c) => c.kind === 'block');
    expect(blockChildren.map((c) => c.key)).toEqual(['b']);
  });

  it('can extract multiple blocks', () => {
    const tree = buildTree([block('a'), block('b'), block('c')]);
    const extracted = tree.extractBlocks(['a', 'c']);

    const children = extracted.children(extracted.root.id);
    const blockChildren = children.filter((c) => c.kind === 'block');
    expect(blockChildren.map((c) => c.key)).toEqual(['a', 'c']);
  });
});

// ============================================================================
// MARK: findParent
// ============================================================================

describe('VirtualTree.findParent', () => {
  it('returns the root container id for top-level blocks', () => {
    const tree = buildTree([block('a'), block('b')]);
    const parentId = tree.findParent(createBlockItemId('a'));
    expect(parentId).toBe(tree.root.id);
  });

  it('returns the parent container for nested blocks', () => {
    const child = block('child');
    const parent = group('parent', [child], ['brush']);
    const tree = buildTree([parent], ['group']);

    const parentId = tree.findParent(createBlockItemId('child'));
    expect(parentId).toBe(createContainerItemId('parent'));
  });
});
