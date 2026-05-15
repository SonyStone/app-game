import * as Tree from 'src/core/tree';
import { describe, expect, it } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

function sampleTree(): Tree.Tree {
  return {
    root: ['groupA', 'groupB'],
    groupA: ['item-1', 'item-2', 'item-3'],
    groupB: ['item-4', 'item-5']
  };
}

function deepTree(): Tree.Tree {
  return {
    root: ['a', 'b'],
    a: ['a1', 'a2'],
    b: ['b1'],
    a1: ['deep-1', 'deep-2']
  };
}

// ============================================================================
// MARK: Tests
// ============================================================================

describe('Tree', () => {
  // ========================================================================
  // MARK: move
  // ========================================================================

  describe('move', () => {
    it('moves item to a different container (append)', () => {
      const result = Tree.move(sampleTree(), 'item-1', { parent: 'groupB', before: null });
      expect(result['groupA']).toEqual(['item-2', 'item-3']);
      expect(result['groupB']).toEqual(['item-4', 'item-5', 'item-1']);
    });

    it('moves item before another item in same container', () => {
      const result = Tree.move(sampleTree(), 'item-3', { parent: 'groupA', before: 'item-1' });
      expect(result['groupA']).toEqual(['item-3', 'item-1', 'item-2']);
    });

    it('moves item before another item in different container', () => {
      const result = Tree.move(sampleTree(), 'item-1', { parent: 'groupB', before: 'item-4' });
      expect(result['groupA']).toEqual(['item-2', 'item-3']);
      expect(result['groupB']).toEqual(['item-1', 'item-4', 'item-5']);
    });

    it('moves group to a new position at root', () => {
      const result = Tree.move(sampleTree(), 'groupB', { parent: 'root', before: 'groupA' });
      expect(result['root']).toEqual(['groupB', 'groupA']);
      // groupB children are preserved
      expect(result['groupB']).toEqual(['item-4', 'item-5']);
    });

    it('moves group into another group (nesting)', () => {
      const result = Tree.move(sampleTree(), 'groupB', { parent: 'groupA', before: null });
      expect(result['root']).toEqual(['groupA']);
      expect(result['groupA']).toEqual(['item-1', 'item-2', 'item-3', 'groupB']);
      expect(result['groupB']).toEqual(['item-4', 'item-5']);
    });

    it('appends when before key is not found', () => {
      const result = Tree.move(sampleTree(), 'item-1', { parent: 'groupB', before: 'nonexistent' as string });
      expect(result['groupB']).toEqual(['item-4', 'item-5', 'item-1']);
    });

    it('preserves container children entry for moved groups', () => {
      const tree = { root: ['g'], g: [] } as Tree.Tree;
      const result = Tree.move(tree, 'g', { parent: 'root', before: null });
      // g should still have its children entry even though it was moved
      expect(result['g']).toEqual([]);
    });

    it('does not mutate the original tree', () => {
      const tree = sampleTree();
      const original = JSON.parse(JSON.stringify(tree));
      Tree.move(tree, 'item-1', { parent: 'groupB', before: null });
      expect(tree).toEqual(original);
    });
  });

  // ========================================================================
  // MARK: parentMap
  // ========================================================================

  describe('parentMap', () => {
    it('maps children to their parent', () => {
      const map = Tree.parentMap(sampleTree());
      expect(map.get('groupA')).toBe('root');
      expect(map.get('groupB')).toBe('root');
      expect(map.get('item-1')).toBe('groupA');
      expect(map.get('item-4')).toBe('groupB');
    });

    it('does not include root itself', () => {
      const map = Tree.parentMap(sampleTree());
      expect(map.has('root')).toBe(false);
    });

    it('handles deeply nested trees', () => {
      const map = Tree.parentMap(deepTree());
      expect(map.get('deep-1')).toBe('a1');
      expect(map.get('a1')).toBe('a');
      expect(map.get('a')).toBe('root');
    });

    it('returns empty map for tree with only root', () => {
      const map = Tree.parentMap({ root: [] } as Tree.Tree);
      expect(map.size).toBe(0);
    });
  });

  // ========================================================================
  // MARK: containerKeys
  // ========================================================================

  describe('containerKeys', () => {
    it('finds all containers using default check (has children entry)', () => {
      const keys = Tree.containerKeys(sampleTree());
      expect(keys).toEqual(new Set(['groupA', 'groupB']));
    });

    it('uses custom isContainer predicate', () => {
      const groups = new Set(['groupA']);
      const keys = Tree.containerKeys(sampleTree(), (key) => groups.has(key));
      // Only groupA is recognized, groupB is treated as a leaf
      expect(keys).toEqual(new Set(['groupA']));
    });

    it('walks into nested containers', () => {
      const keys = Tree.containerKeys(deepTree());
      // a, b, and a1 all have children entries
      expect(keys).toEqual(new Set(['a', 'b', 'a1']));
    });

    it('returns empty set when no containers exist', () => {
      const tree = { root: ['x', 'y'] } as Tree.Tree;
      const keys = Tree.containerKeys(tree);
      expect(keys.size).toBe(0);
    });
  });

  // ========================================================================
  // MARK: buildContainers
  // ========================================================================

  describe('buildContainers', () => {
    it('builds root + one container per group', () => {
      const tree = sampleTree();
      const containers = Tree.buildContainers(tree, {
        isContainer: (key) => key in tree && key !== 'root',
        getItemRect: () => undefined,
        getContainerRect: () => undefined
      });

      const keys = containers.map((c) => c.key);
      expect(keys).toContain('root');
      expect(keys).toContain('groupA');
      expect(keys).toContain('groupB');
      expect(containers).toHaveLength(3);
    });

    it('container items() return correct children', () => {
      const tree = sampleTree();
      const containers = Tree.buildContainers(tree, {
        isContainer: (key) => key in tree && key !== 'root',
        getItemRect: () => undefined,
        getContainerRect: () => undefined
      });

      const root = containers.find((c) => c.key === 'root')!;
      const groupA = containers.find((c) => c.key === 'groupA')!;

      expect(root.items()).toEqual(['groupA', 'groupB']);
      expect(groupA.items()).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('passes acceptTags from getAcceptTags option', () => {
      const tree = sampleTree();
      const containers = Tree.buildContainers(tree, {
        isContainer: (key) => key in tree && key !== 'root',
        getItemRect: () => undefined,
        getContainerRect: () => undefined,
        getAcceptTags: (key) => (key === 'root' ? undefined : ['item'])
      });

      const root = containers.find((c) => c.key === 'root')!;
      const groupA = containers.find((c) => c.key === 'groupA')!;

      expect(root.acceptTags).toBeUndefined();
      expect(groupA.acceptTags).toEqual(['item']);
    });

    it('delegates getRect and getContainerRect correctly', () => {
      const tree = sampleTree();
      const itemRectCalls: string[] = [];
      const containerRectCalls: string[] = [];

      const containers = Tree.buildContainers(tree, {
        isContainer: (key) => key in tree && key !== 'root',
        getItemRect: (key) => {
          itemRectCalls.push(key);
          return undefined;
        },
        getContainerRect: (key) => {
          containerRectCalls.push(key);
          return undefined;
        }
      });

      // Call getRect on groupA container
      const groupA = containers.find((c) => c.key === 'groupA')!;
      groupA.getRect('item-1');
      expect(itemRectCalls).toEqual(['item-1']);

      // Call getContainerRect
      groupA.getContainerRect();
      expect(containerRectCalls).toEqual(['groupA']);

      // Call root's getContainerRect
      const root = containers.find((c) => c.key === 'root')!;
      root.getContainerRect();
      expect(containerRectCalls).toEqual(['groupA', 'root']);
    });

    it('handles empty tree (root only)', () => {
      const tree = { root: [] } as Tree.Tree;
      const containers = Tree.buildContainers(tree, {
        isContainer: () => false,
        getItemRect: () => undefined,
        getContainerRect: () => undefined
      });
      expect(containers).toHaveLength(1);
      expect(containers[0].key).toBe('root');
      expect(containers[0].items()).toEqual([]);
    });
  });
});
