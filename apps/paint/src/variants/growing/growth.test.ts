import { describe, expect, it } from 'vitest';
import {
  counted,
  emptyUsage,
  grownFeatures,
  growthProgress,
  parseUsage,
  pendingHint,
  requested,
  shortcutFeatures,
  type Usage
} from './growth';

const usage = (patch: Partial<Usage>): Usage => ({ ...emptyUsage, ...patch });
const key = (key: string, patch: Partial<Parameters<typeof shortcutFeatures>[0]> = {}) => ({
  key,
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...patch
});

describe('grownFeatures', () => {
  it('grows nothing for a new user', () => {
    expect(grownFeatures(emptyUsage).size).toBe(0);
  });

  it('grows the swatches after five strokes, the size after twelve', () => {
    expect([...grownFeatures(usage({ strokes: 4 }))]).toEqual([]);
    expect([...grownFeatures(usage({ strokes: 5 }))]).toEqual(['swatches']);
    expect([...grownFeatures(usage({ strokes: 12 }))]).toEqual(['swatches', 'size']);
  });

  it('grows the color disc after a few color changes, with the swatches it lives in', () => {
    expect([...grownFeatures(usage({ colorPicks: 3 }))]).toEqual(['swatches', 'colorDisc']);
  });

  it('grows layers after much drawing or after much erasing', () => {
    expect(grownFeatures(usage({ strokes: 40 })).has('layers')).toBe(true);
    expect(grownFeatures(usage({ erases: 10 })).has('layers')).toBe(true);
    expect(grownFeatures(usage({ strokes: 39, erases: 9 })).has('layers')).toBe(false);
  });

  it('grows blending once layers are used, bringing the layers along', () => {
    const grown = grownFeatures(usage({ layerActions: 3 }));
    expect(grown.has('layerBlend')).toBe(true);
    expect(grown.has('layers')).toBe(true);
  });

  it('grows the brush library from taps on the active brush', () => {
    expect(grownFeatures(usage({ brushTaps: 1 })).has('brushes')).toBe(false);
    expect(grownFeatures(usage({ brushTaps: 2 })).has('brushes')).toBe(true);
  });

  it('grows the view controls after zooming or panning', () => {
    expect(grownFeatures(usage({ navigations: 2 })).has('view')).toBe(true);
  });

  it('grows fill and transform with the first selection, the gradient later', () => {
    const first = grownFeatures(usage({ selections: 1 }));
    expect(first.has('fill')).toBe(true);
    expect(first.has('transform')).toBe(true);
    expect(first.has('gradient')).toBe(false);
    expect(grownFeatures(usage({ selections: 3 })).has('gradient')).toBe(true);
  });

  it('grows requested controls at once, with what they need', () => {
    const grown = grownFeatures(usage({ requested: ['gradient'] }));
    expect([...grown].sort()).toEqual(['gradient', 'selection']);
  });

  it('grows everything for a long-time user', () => {
    const veteran = usage({ strokes: 500, colorPicks: 10, navigations: 10, layerActions: 10, selections: 5 });
    expect(grownFeatures(veteran).size).toBe(13);
  });
});

describe('pendingHint', () => {
  it('welcomes first, then introduces grown controls in dock order', () => {
    const grown = grownFeatures(usage({ strokes: 12 }));
    expect(pendingHint(grown, new Set(), false)).toBe('welcome');
    expect(pendingHint(grown, new Set(['welcome']), false)).toBe('swatches');
    expect(pendingHint(grown, new Set(['welcome', 'swatches']), false)).toBe('size');
    expect(pendingHint(grown, new Set(['welcome', 'swatches', 'size']), false)).toBeUndefined();
  });

  it('introduces nothing while everything is shown', () => {
    expect(pendingHint(new Set(['layers']), new Set(), true)).toBeUndefined();
  });
});

describe('usage updates', () => {
  it('counts', () => {
    expect(counted(emptyUsage, 'strokes').strokes).toBe(1);
    expect(counted(usage({ erases: 2 }), 'erases', 3).erases).toBe(5);
  });

  it('adds requests once and keeps the object when nothing is new', () => {
    const once = requested(emptyUsage, ['fill', 'fill']);
    expect(once.requested).toEqual(['fill']);
    expect(requested(once, ['fill'])).toBe(once);
  });

  it('tells how far a locked control is', () => {
    expect(growthProgress('layers', usage({ strokes: 28 }))).toBe('after 40 strokes · 12 to go');
    expect(growthProgress('layers', usage({ strokes: 2, erases: 8 }))).toBe('after 10 erased strokes · 2 to go');
    expect(growthProgress('fill', emptyUsage)).toBe('after the first selection · 1 to go');
  });
});

describe('shortcutFeatures', () => {
  it('unlocks tools by their keys', () => {
    expect(shortcutFeatures(key('l'))).toEqual(['selection']);
    expect(shortcutFeatures(key('G', { shiftKey: true }))).toEqual(['fill']);
    expect(shortcutFeatures(key(']'))).toEqual(['size']);
    expect(shortcutFeatures(key('x'))).toEqual(['swatches']);
  });

  it('unlocks commands with Ctrl or Cmd', () => {
    expect(shortcutFeatures(key('t', { ctrlKey: true }))).toEqual(['transform']);
    expect(shortcutFeatures(key('s', { metaKey: true }))).toEqual(['export']);
    expect(shortcutFeatures(key('=', { ctrlKey: true }))).toEqual(['view']);
    expect(shortcutFeatures(key('I', { ctrlKey: true, shiftKey: true }))).toEqual(['selection']);
  });

  it('unlocks nothing for undo, the brush or Alt', () => {
    expect(shortcutFeatures(key('z', { ctrlKey: true }))).toEqual([]);
    expect(shortcutFeatures(key('b'))).toEqual([]);
    expect(shortcutFeatures(key('l', { altKey: true }))).toEqual([]);
  });

  it('matches letters of non-Latin layouts by their physical key', () => {
    expect(shortcutFeatures(key('д', { code: 'KeyL' }))).toEqual(['selection']);
    expect(shortcutFeatures(key('х', { code: 'BracketLeft' }))).toEqual(['size']);
  });
});

describe('parseUsage', () => {
  it('reads stored usage, dropping what it does not know', () => {
    expect(
      parseUsage({ strokes: 7.6, erases: -1, colorPicks: 'x', requested: ['fill', 'teleport'], extra: 1 })
    ).toEqual({ ...emptyUsage, strokes: 7, requested: ['fill'] });
  });

  it('starts fresh from anything else', () => {
    expect(parseUsage(undefined)).toEqual(emptyUsage);
    expect(parseUsage('broken')).toEqual(emptyUsage);
  });
});
