import { createStrokeSampler, defaultBrush } from '@app-game/paint-core/brush';
import { readArchive, writeArchive } from '@app-game/paint-core/paintbrush/archive';
import { brushSchema, parseDocument, patch } from '@app-game/paint-core/paintbrush/document';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { createBrushTools } from '../brush/createBrushTools';
import { applyPreset, builtInPresets, presetSettings } from './brushPresets';
import { createBrushLibrary } from './createBrushLibrary';
import { nativeDocument, resolveNative } from './nativeDocument';
import { exportPaintbrush, importPaintbrush } from './paintbrushFile';

function fixture(name: string) {
  return readFileSync(
    new URL('../../../../../packages/paint-core/tests/paintbrush/' + name + '.json', import.meta.url),
    'utf8'
  );
}

it('matches the built-in soft round fixture exactly', () => {
  expect(JSON.parse(JSON.stringify(nativeDocument(builtInPresets[0]!)))).toEqual(JSON.parse(fixture('soft-round')));
});

it.each([
  ...builtInPresets,
  {
    id: 'user',
    name: 'Fine',
    settings: presetSettings({ ...defaultBrush(), size: 4, stroke: { ...defaultBrush().stroke, normal: 17 } }, [
      'size',
      'stroke'
    ]),
    resourceIds: []
  }
])('preserves $name fields, packet boundaries and preview tails', async (preset) => {
  const archive = await readArchive(await exportPaintbrush(preset, []));
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  const native = resolveNative(archive.brushes[0]!.view);
  expect(native.status).toBe('supported');
  if (native.status !== 'supported') {
    throw new Error(native.reasons.join(', '));
  }
  expect(native.settings).toEqual(preset.settings);
  const host = { ...defaultBrush(), color: '#77aacc', opacity: 0.72 };
  const before = createStrokeSampler(applyPreset(host, preset));
  const after = createStrokeSampler(applyPreset(host, { ...preset, settings: native.settings }));
  const samples = Array.from({ length: 5 }, (_, i) => ({ x: i * 5, y: i, pressure: 0.04 + i * 0.01, time: i * 10 }));
  expect(after.add(samples.slice(0, 1)).concat(after.add(samples.slice(1, 3)))).toEqual(
    before.add(samples.slice(0, 3))
  );
  expect(after.preview(samples.slice(3))).toEqual(before.preview(samples.slice(3)));
  expect(after.add(samples.slice(3))).toEqual(before.add(samples.slice(3)));
});

it("carries a preset's own colours in the color section, not as a render hint", () => {
  const brush = { ...defaultBrush(), color: '#123456', backgroundColor: '#abcdef' };
  const saved = { id: 'inked', name: 'Inked', settings: presetSettings(brush, ['tip', 'color']), resourceIds: [] };
  const document = nativeDocument(saved);

  expect(document.definition.color).toEqual({ foreground: '#123456', background: '#abcdef' });
  expect(document.definition.renderHints).toBeUndefined();
  expect(document.apply).toContain('/color');

  const native = resolveNative(document);
  if (native.status !== 'supported') {
    throw new Error(native.reasons.join(', '));
  }

  expect(native.settings).toEqual(saved.settings);
});

it('keeps host size, colours and opacity when only the tip is saved', () => {
  const saved = { id: 'tip', name: 'Tip', settings: presetSettings(defaultBrush(), ['tip']), resourceIds: [] };
  const native = resolveNative(nativeDocument(saved));
  if (native.status !== 'supported') {
    throw new Error(native.reasons.join(', '));
  }
  const host = { ...defaultBrush(), size: 77, opacity: 0.21, color: '#ffeedd' };
  expect(applyPreset(host, { ...saved, settings: native.settings })).toEqual({ ...host, engine: undefined });
});

it('names the differences and withholds native fields for the two richer fixtures', () => {
  for (const [name, terms] of [
    ['grain-nib', ['photoshop-v1', 'photoshop-height-v1', 'Dual brush']],
    ['lettering', ['multiple tips', 'ellipse', 'speed', 'taper', 'maximum-overlap']]
  ] as const) {
    const result = resolveNative(parseDocument(fixture(name), brushSchema));
    expect(result.status).toBe('approximate');
    expect(result).not.toHaveProperty('settings');
    for (const term of terms) {
      expect(result.reasons!.join(', ')).toContain(term);
    }
  }
});

it('imports a built-in as a copy and preserves raw metadata through rename, shared size and Save As', async () => {
  const { library, tools } = createRoot(() => {
    const library = createBrushLibrary({});
    return { library, tools: createBrushTools({ library }) };
  });
  const file = 'brushes/round.json';
  const manifest =
    '{"format":"paintbrush","version":[1,0],"minReader":[1,0],"private":900719925474099312345,"brushes":[{"file":"' +
    file +
    '","folder":"Ink","other":900719925474099312346}]}';
  const original = fixture('soft-round').replace(
    '"hardness": 0.65',
    '"private":900719925474099312347,"hardness": 0.65'
  );
  const text = patch(original, '/definition/extensions', {
    'example.data.v1': { value: 'private/data', impact: 'metadata' }
  });
  const bytes = writeArchive(manifest, new Map([[file, text]]), new Map([['private/data', Uint8Array.of(42)]]));
  expect(await importPaintbrush(bytes, library)).toEqual([]);
  const copy = library.presets().at(-1)!;
  expect(copy.id).not.toBe('builtin:soft-round');
  expect(copy.derivedFrom).toBe('builtin:soft-round');
  library.update(copy.id, { name: 'Renamed' });
  tools.setSharedSize(true);
  tools.updateBrush({ size: 87 });
  tools.selectPreset(copy.id, 'brush');
  tools.updateBrush({ hardness: 0.4 });
  tools.savePreset();
  const saved = tools.savePresetAs('Saved copy', ['tip', 'size']);
  expect(saved.settings.size).toBe(87);
  expect(saved.derivedFrom).toBe(copy.id);
  for (const preset of [library.find(copy.id)!, saved]) {
    const restored = await readArchive(await exportPaintbrush(preset, []));
    if (restored.status !== 'editable') {
      throw new Error(restored.reason);
    }
    expect(restored.manifestText).toContain('900719925474099312346');
    const doc = restored.brushes[0]!;
    expect(doc.text).toContain('900719925474099312347');
    expect(doc.view.id).toBe(preset.id);
    expect(doc.view.derivedFrom).toBe(preset.derivedFrom);
    expect(doc.view.name).toBe(preset.name);
    expect(doc.view.definition.tips.round!.hardness).toBe(0.4);
    expect(doc.view.definition.extensions).toHaveProperty(['example.data.v1']);
    expect(restored.files.get('private/data')).toEqual(Uint8Array.of(42));
  }
});

it('imports only drawable brushes from a mixed archive without changing the active tool', async () => {
  const library = createRoot(() => createBrushLibrary({}));
  const docs = new Map([
    ['brushes/a.json', fixture('lettering')],
    ['brushes/b.json', fixture('soft-round')]
  ]);
  const manifest = {
    format: 'paintbrush',
    version: [1, 0],
    minReader: [1, 0],
    brushes: [...docs.keys()].map((file) => ({ file }))
  };
  const rejected = await importPaintbrush(writeArchive(JSON.stringify(manifest), docs), library);
  expect(rejected).toHaveLength(1);
  expect(rejected[0]).toContain('Alternating lettering pen');
  expect(library.presets()).toHaveLength(3);
});

it('exports sampled tips with native rotation, independent spacing and decoded coverage', async () => {
  const image = {
    id: 'native-tip',
    format: 'r8unorm' as const,
    width: 2,
    height: 2,
    pixels: Uint8Array.of(0, 255, 128, 0)
  };
  const preset = {
    id: 'textured',
    name: 'Native nib',
    resourceIds: [image.id],
    settings: {
      ...defaultBrush(),
      engine: { id: 'textured', settings: { tipId: image.id, angle: 0.3, spacing: 0.16 } }
    }
  };
  const archive = await readArchive(await exportPaintbrush(preset, [image]));
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  expect(resolveNative(archive.brushes[0]!.view).settings).toEqual(preset.settings);
  expect([...archive.assets.values()][0]!.pixels).toEqual(image.pixels);
});

it('commits an entire import to existing storage and can re-export after reopening', async () => {
  const { createBrushStorage } = await import('./createBrushStorage');
  const name = crypto.randomUUID();
  const open = () =>
    createRoot(() => {
      const storage = createBrushStorage({
        name,
        onError: (error) => {
          throw new Error(error.message);
        }
      });
      return createBrushLibrary({ storage });
    });
  const first = open();
  const bytes = await exportPaintbrush(builtInPresets[1]!, []);
  await importPaintbrush(bytes, first);
  const id = first.presets().at(-1)!.id;
  const second = open();
  const restored = await second.load(id);
  expect(restored?.paintbrush?.entries).toBeInstanceOf(Map);
  const archive = await readArchive(await exportPaintbrush(restored!, []));
  expect(archive.brushes?.[0]?.view).toMatchObject({
    id,
    derivedFrom: 'builtin:eraser',
    definition: { tool: 'eraser' }
  });
});

it('keeps the library intact when storage rejects the batch', async () => {
  const storage = {
    readPreset: async () => undefined,
    readPresets: async () => [],
    readResources: async () => [],
    putPreset: async () => true,
    putPresets: async () => false,
    deletePreset: () => {}
  };
  const library = createRoot(() => createBrushLibrary({ storage }));
  await expect(importPaintbrush(await exportPaintbrush(builtInPresets[0]!, []), library)).rejects.toThrow(
    /could not be saved/
  );
  expect(library.presets()).toEqual(builtInPresets);
});

it('uses version-one defaults independently of the current canvas preset', () => {
  const doc = parseDocument(
    JSON.stringify({
      id: 'minimal',
      name: 'Minimal',
      definition: {
        tool: 'brush',
        tips: { r: { kind: 'round', hardness: 1 } },
        sequence: { order: 'cycle', tips: ['r'] }
      }
    }),
    brushSchema
  );
  expect(resolveNative(doc).settings).toEqual({
    tool: 'brush',
    hardness: 1,
    spacing: 0.12,
    size: 32,
    flow: 1,
    opacity: 1,
    pressureSize: false,
    pressureFlow: false,
    mixing: 'linear',
    stroke: { mode: 'none', normal: 1, smooth: 10, stabilizer: 6, catchUp: true }
  });
});
