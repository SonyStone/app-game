import { createRoot } from 'solid-js';
import { createSelection, type Selection, type SelectionOptions } from 'src/primitives/createSelection';
import { describe, expect, it, vi } from 'vitest';

// ============================================================================
// MARK: Helpers
// ============================================================================

/** Minimal modifier event — plain click (no modifiers). */
const plain = { ctrlKey: false, metaKey: false, shiftKey: false };
const ctrl = { ctrlKey: true, metaKey: false, shiftKey: false };
const meta = { ctrlKey: false, metaKey: true, shiftKey: false };
const shift = { ctrlKey: false, metaKey: false, shiftKey: true };

function withSelection<K>(options: SelectionOptions<K>, fn: (sel: Selection<K>) => void): void {
  createRoot((dispose) => {
    const sel = createSelection(options);
    fn(sel);
    dispose();
  });
}

const defaultItems = () => ['a', 'b', 'c', 'd', 'e'];

// ============================================================================
// MARK: Tests
// ============================================================================

describe('createSelection', () => {
  // ────────────────────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('starts with empty selection', () => {
      withSelection({ items: defaultItems }, (sel) => {
        expect(sel.selected()).toEqual([]);
      });
    });

    it('nothing is selected initially', () => {
      withSelection({ items: defaultItems }, (sel) => {
        expect(sel.isSelected('a')).toBe(false);
        expect(sel.isSelected('b')).toBe(false);
      });
    });

    it('anchor is null initially', () => {
      withSelection({ items: defaultItems }, (sel) => {
        expect(sel.anchor()).toBeNull();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('set mode (plain click)', () => {
    it('click item → selected', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('b', plain);
        expect(sel.selected()).toEqual(['b']);
        expect(sel.isSelected('b')).toBe(true);
      });
    });

    it('click another → replaces previous', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', plain);
        expect(sel.selected()).toEqual(['c']);
        expect(sel.isSelected('a')).toBe(false);
        expect(sel.isSelected('c')).toBe(true);
      });
    });

    it('click same item twice → still selected (single)', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('a', plain);
        expect(sel.selected()).toEqual(['a']);
      });
    });

    it('updates anchor on set click', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('c', plain);
        expect(sel.anchor()).toBe('c');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('toggle mode (ctrl/cmd click)', () => {
    it('ctrl+click adds to selection', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', ctrl);
        expect(sel.selected()).toEqual(['a', 'c']);
        expect(sel.isSelected('a')).toBe(true);
        expect(sel.isSelected('c')).toBe(true);
      });
    });

    it('ctrl+click again removes from selection', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', ctrl);
        sel.handleClick('a', ctrl);
        expect(sel.selected()).toEqual(['c']);
        expect(sel.isSelected('a')).toBe(false);
      });
    });

    it('meta+click works the same as ctrl', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('b', meta);
        expect(sel.selected()).toEqual(['a', 'b']);
      });
    });

    it('toggle on empty selection → adds item', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('d', ctrl);
        expect(sel.selected()).toEqual(['d']);
      });
    });

    it('toggle off last item → empty selection', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('a', ctrl);
        expect(sel.selected()).toEqual([]);
      });
    });

    it('updates anchor on toggle', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', ctrl);
        expect(sel.anchor()).toBe('c');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('range mode (shift click)', () => {
    it('shift+click selects range from anchor', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('b', plain); // anchor = b
        sel.handleClick('d', shift); // range b..d
        expect(sel.selected()).toEqual(['b', 'c', 'd']);
      });
    });

    it('shift+click backward range', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('d', plain); // anchor = d
        sel.handleClick('b', shift); // range b..d
        expect(sel.selected()).toEqual(['b', 'c', 'd']);
      });
    });

    it('shift+click same as anchor → single item', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('c', plain);
        sel.handleClick('c', shift);
        expect(sel.selected()).toEqual(['c']);
      });
    });

    it('shift+click does NOT update anchor', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('b', plain); // anchor = b
        sel.handleClick('d', shift); // range b..d, anchor stays b
        expect(sel.anchor()).toBe('b');
      });
    });

    it('multiple shift+clicks adjust range end without moving anchor', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain); // anchor = a
        sel.handleClick('c', shift); // range a..c
        expect(sel.selected()).toEqual(['a', 'b', 'c']);

        sel.handleClick('e', shift); // range a..e (anchor still a)
        expect(sel.selected()).toEqual(['a', 'b', 'c', 'd', 'e']);

        sel.handleClick('b', shift); // range a..b
        expect(sel.selected()).toEqual(['a', 'b']);
      });
    });

    it('shift+click with no anchor → set mode', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('c', shift);
        expect(sel.selected()).toEqual(['c']);
        expect(sel.anchor()).toBe('c');
      });
    });

    it('shift+click after toggle uses toggle anchor', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain); // anchor = a
        sel.handleClick('c', ctrl); // anchor = c
        sel.handleClick('e', shift); // range c..e
        expect(sel.selected()).toEqual(['c', 'd', 'e']);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('multiselect disabled', () => {
    it('ctrl+click uses set mode when multiselect=false', () => {
      withSelection({ items: defaultItems, multiselect: false }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('b', ctrl);
        expect(sel.selected()).toEqual(['b']); // replaced, not added
      });
    });

    it('shift+click uses set mode when multiselect=false', () => {
      withSelection({ items: defaultItems, multiselect: false }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('d', shift);
        expect(sel.selected()).toEqual(['d']); // set, not range
      });
    });

    it('getMode returns set regardless of modifiers', () => {
      withSelection({ items: defaultItems, multiselect: false }, (sel) => {
        expect(sel.getMode(ctrl)).toBe('set');
        expect(sel.getMode(shift)).toBe('set');
        expect(sel.getMode(meta)).toBe('set');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('programmatic API', () => {
    it('select() sets specific keys', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.select(['b', 'd']);
        expect(sel.selected()).toEqual(['b', 'd']);
        expect(sel.isSelected('b')).toBe(true);
        expect(sel.isSelected('d')).toBe(true);
        expect(sel.isSelected('a')).toBe(false);
      });
    });

    it('select() sets anchor to first key', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.select(['c', 'e']);
        expect(sel.anchor()).toBe('c');
      });
    });

    it('select([]) clears and sets anchor to null', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.select(['a']);
        sel.select([]);
        expect(sel.selected()).toEqual([]);
        expect(sel.anchor()).toBeNull();
      });
    });

    it('clear() empties selection and anchor', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', ctrl);
        sel.clear();
        expect(sel.selected()).toEqual([]);
        expect(sel.anchor()).toBeNull();
        expect(sel.isSelected('a')).toBe(false);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('onSelectionChange callback', () => {
    it('fires on handleClick', () => {
      const onChange = vi.fn();
      withSelection({ items: defaultItems, onSelectionChange: onChange }, (sel) => {
        sel.handleClick('a', plain);
        expect(onChange).toHaveBeenCalledWith(['a']);
      });
    });

    it('fires on each click', () => {
      const onChange = vi.fn();
      withSelection({ items: defaultItems, onSelectionChange: onChange }, (sel) => {
        sel.handleClick('a', plain);
        sel.handleClick('c', ctrl);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
      });
    });

    it('fires on select()', () => {
      const onChange = vi.fn();
      withSelection({ items: defaultItems, onSelectionChange: onChange }, (sel) => {
        sel.select(['b', 'd']);
        expect(onChange).toHaveBeenCalledWith(['b', 'd']);
      });
    });

    it('fires on clear()', () => {
      const onChange = vi.fn();
      withSelection({ items: defaultItems, onSelectionChange: onChange }, (sel) => {
        sel.handleClick('a', plain);
        sel.clear();
        expect(onChange).toHaveBeenLastCalledWith([]);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('getMode', () => {
    it('returns correct mode for each modifier combo', () => {
      withSelection({ items: defaultItems }, (sel) => {
        expect(sel.getMode(plain)).toBe('set');
        expect(sel.getMode(ctrl)).toBe('toggle');
        expect(sel.getMode(meta)).toBe('toggle');
        expect(sel.getMode(shift)).toBe('range');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('numeric keys', () => {
    it('works with number keys', () => {
      withSelection({ items: () => [1, 2, 3, 4, 5] }, (sel) => {
        sel.handleClick(2, plain);
        sel.handleClick(4, shift);
        expect(sel.selected()).toEqual([2, 3, 4]);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('click key not in items → still selected (set mode)', () => {
      withSelection({ items: defaultItems }, (sel) => {
        sel.handleClick('z', plain);
        expect(sel.selected()).toEqual(['z']);
      });
    });

    it('range with anchor not in items → falls back to set', () => {
      withSelection({ items: () => ['x', 'y'] }, (sel) => {
        sel.handleClick('removed', plain); // anchor = 'removed'
        // Now items changed to not include 'removed'
        sel.handleClick('y', shift);
        // applyRange can't find 'removed' → fallback to [y]
        expect(sel.selected()).toEqual(['y']);
      });
    });
  });
});
