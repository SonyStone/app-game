import { describe, expect, it } from 'vitest';
import { catalog, searchPalette, suggestions, type PaletteContext } from './catalog';
import { fuzzyScore, rankByQuery } from './fuzzy';

const context: PaletteContext = {
  presets: [
    { id: 'builtin:soft-round', name: 'Soft round' },
    { id: 'user:1', name: 'Dry ink' }
  ],
  layers: [{ name: 'Layer 1' }, { name: 'Sky' }],
  layerDetails: [
    { visible: true, opacity: 1, blend: 'normal' },
    { visible: false, opacity: 0.4, blend: 'multiply' }
  ],
  activeLayer: 2,
  mixer: false,
  playground: true
};

describe('rankByQuery', () => {
  const items = [{ title: 'New layer' }, { title: 'Eraser', keywords: 'erase rubber' }, { title: 'Lasso' }];

  it('finds substrings and letters in order, best first', () => {
    expect(rankByQuery('las', items).map((item) => item.title)).toEqual(['Lasso']);
    expect(rankByQuery('nl', items).map((item) => item.title)).toEqual(['New layer']);
    expect(rankByQuery('rubber', items).map((item) => item.title)).toEqual(['Eraser']);
    expect(rankByQuery('', items)).toEqual(items);
  });

  it('needs every word to match, unless no item matches them all', () => {
    expect(rankByQuery('new lay', items).map((item) => item.title)).toEqual(['New layer']);
    expect(rankByQuery('new xyz', items).map((item) => item.title)).toEqual(['New layer']);
    expect(rankByQuery('xyz', items)).toEqual([]);
  });

  it('prefers a match at the start of a word over letters scattered mid-word', () => {
    expect(fuzzyScore('lay', 'New layer')!).toBeGreaterThan(fuzzyScore('nlr', 'New layer') ?? -Infinity);
    expect(fuzzyScore('ea', 'Paint brush gradient')).toBeUndefined();
  });
});

describe('searchPalette', () => {
  it('puts the parsed command first, as what Enter runs', () => {
    const [first] = searchPalette('size 24', context);
    expect(first).toMatchObject({ title: 'Brush 24 px', intents: [{ type: 'size', px: 24 }] });
  });

  it('uses the catalog row for a parsed command it lists, keeping its shortcut', () => {
    const rows = searchPalette('eraser', context);
    expect(rows[0]).toMatchObject({ title: 'Eraser', shortcut: 'E' });
    expect(rows.filter((row) => row.title === 'Eraser')).toHaveLength(1);
  });

  it('lists a combined command as one row', () => {
    const [first] = searchPalette('red, size 12', context);
    expect(first).toMatchObject({ title: 'Color red · Brush 12 px', group: 'Commands' });
    expect(first!.intents).toHaveLength(2);
  });

  it('finds presets, layers and colors by name', () => {
    expect(searchPalette('dry', context)[0]).toMatchObject({ title: 'Dry ink', group: 'Brush' });
    expect(searchPalette('sky', context)[0]).toMatchObject({
      title: 'Sky',
      detail: 'active · hidden · 40% · Multiply'
    });
    expect(searchPalette('ora', context)[0]).toMatchObject({ title: 'Color orange', swatch: '#ff8800' });
  });

  it('lists series of values only when the query names their setting', () => {
    expect(searchPalette('br', context).some((row) => row.title === 'Brush 16 px')).toBe(false);
    expect(searchPalette('size', context).some((row) => row.title === 'Brush 16 px')).toBe(true);
    expect(searchPalette('zoom', context).some((row) => row.title === 'Zoom 400%')).toBe(true);
  });

  it('lists every named color for `color`', () => {
    const rows = searchPalette('colors', context);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((row) => row.swatch !== undefined)).toBe(true);
  });

  it('leaves out Mixer Brush commands while the Mixer Brush is not in use', () => {
    expect(catalog(context).some((row) => row.group === 'Mixer')).toBe(false);
    expect(catalog({ ...context, mixer: true }).some((row) => row.group === 'Mixer')).toBe(true);
  });
});

describe('suggestions', () => {
  it('offers the other painting tool, history while possible and selection commands for a selection', () => {
    const idle = suggestions({ tool: 'brush', selected: false, canUndo: false, canRedo: false });
    expect(idle[0]).toEqual({ type: 'tool', tool: 'eraser' });
    expect(idle.some((intent) => intent.type === 'history')).toBe(false);

    const selecting = suggestions({ tool: 'eraser', selected: true, canUndo: true, canRedo: false });
    expect(selecting[0]).toEqual({ type: 'tool', tool: 'brush' });
    expect(selecting).toContainEqual({ type: 'history', action: 'undo', count: 1 });
    expect(selecting).toContainEqual({ type: 'selection', action: 'none' });
  });
});
