import * as Place from 'src/core/place';
import * as Rect from 'src/core/rect';
import { createItemId } from 'src/core/types';
import * as Vec2 from 'src/core/vec2';
import { describe, expect, it, vi } from 'vitest';

describe('core types', () => {
  describe('ItemId', () => {
    it('creates a branded string', () => {
      const id = createItemId('test-1');
      expect(id).toBe('test-1');
      // The brand exists at the type level only — at runtime it's just a string
      expect(typeof id).toBe('string');
    });
  });

  describe('Vec2', () => {
    it('has a Zero constant', () => {
      expect(Vec2.Zero).toEqual({ x: 0, y: 0 });
    });

    it('creates a vector with of()', () => {
      const v = Vec2.of(10, 20);
      expect(v).toEqual({ x: 10, y: 20 });
    });
  });

  describe('Rect', () => {
    it('has a Zero constant', () => {
      expect(Rect.Zero).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it('creates a rect with of()', () => {
      const r = Rect.of(5, 10, 100, 50);
      expect(r).toEqual({ x: 5, y: 10, width: 100, height: 50 });
    });

    it('creates a rect from an element with fromElement()', () => {
      const el = document.createElement('div');
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        x: 20,
        y: 30,
        width: 150,
        height: 80,
        top: 30,
        left: 20,
        right: 170,
        bottom: 110,
        toJSON: () => {}
      });
      const r = Rect.fromElement(el);
      expect(r).toEqual({ x: 20, y: 30, width: 150, height: 80 });
    });

    it('returns undefined from fromElement() when no element is provided', () => {
      expect(Rect.fromElement(undefined)).toBeUndefined();
    });
  });

  describe('Place', () => {
    it('labels a "before" place', () => {
      expect(Place.label({ parent: 'list', before: 'b' })).toBe('before "b"');
    });

    it('labels an "append" place', () => {
      expect(Place.label({ parent: 'list', before: null })).toBe('append');
    });

    it('labels undefined as "none"', () => {
      expect(Place.label(undefined)).toBe('none');
    });

    describe('equals', () => {
      it('returns true for identical places', () => {
        const place = { parent: 'list', before: 'b' };
        expect(Place.equals(place, place)).toBe(true);
      });

      it('returns true for structurally equal places', () => {
        expect(Place.equals({ parent: 'list', before: 'b' }, { parent: 'list', before: 'b' })).toBe(true);
      });

      it('returns true for two append places in the same parent', () => {
        expect(Place.equals({ parent: 'list', before: null }, { parent: 'list', before: null })).toBe(true);
      });

      it('returns true when both are undefined', () => {
        expect(Place.equals(undefined, undefined)).toBe(true);
      });

      it('returns false when parent differs', () => {
        expect(Place.equals({ parent: 'a', before: 'x' }, { parent: 'b', before: 'x' })).toBe(false);
      });

      it('returns false when before differs', () => {
        expect(Place.equals({ parent: 'list', before: 'a' }, { parent: 'list', before: 'b' })).toBe(false);
      });

      it('returns false when one is append and other is before', () => {
        expect(Place.equals({ parent: 'list', before: null }, { parent: 'list', before: 'b' })).toBe(false);
      });

      it('returns false when one is undefined', () => {
        expect(Place.equals({ parent: 'list', before: 'b' }, undefined)).toBe(false);
        expect(Place.equals(undefined, { parent: 'list', before: 'b' })).toBe(false);
      });
    });
  });
});
