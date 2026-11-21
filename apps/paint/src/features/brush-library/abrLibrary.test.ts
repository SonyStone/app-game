// @vitest-environment jsdom
import type { BrushAsset } from '@app-game/abr-brush/library';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr, pixels } from '@app-game/abr-parser';
import type { Brush } from '@app-game/paint-core/brush';
import { assetId } from '@app-game/paint-core/paintbrush/asset';
import 'fake-indexeddb/auto';
import { ok } from 'neverthrow';
import { Blob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearAbrBrush } from '../abr/clearAbrBrush';
import { createBrushSettingsEditor } from '../brush/createBrushSettingsEditor';
import { createBrushTools } from '../brush/createBrushTools';
import type { PaintSession } from '../session';
import { convertAbr, resolveAbrText } from './abrPresetDocument';
import { createBrushLibrary } from './createBrushLibrary';
import { createBrushStorage } from './createBrushStorage';
import { patchFormValues } from './documentSettings';
import { exportPaintbrush, importPaintbrush } from './paintbrushFile';

const asset: BrushAsset = {
  id: 'sample',
  name: 'Ink',
  source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() },
  resources: [],
  tipImage: { width: 2, height: 1, data: Uint8Array.of(100, 255), depth: 8, sourceDepth: 8 },
  preset: { kind: 'brush', sourceId: 'one', tip: { kind: 'sampled', diameter: pixels(30) } }
};
const disposers: (() => void)[] = [];
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', Blob);
  await initAbr();
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

function open(name: string) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const onError = vi.fn();
    const storage = createBrushStorage({ name, onError });
    const library = createBrushLibrary({ storage, onError });
    const tools = createBrushTools({
      library,
      storage,
      clear: (b) => (b.engine?.id === 'abr' ? clearAbrBrush(b) : { ...b, tool: 'eraser' })
    });
    const engine = { putResources: vi.fn(async () => ok()) };
    const editor = createBrushSettingsEditor({ tools, brush: tools.brush, library, engine } as unknown as PaintSession);
    return { storage, library, tools, editor, onError, engine };
  });
}

it('migrates shared legacy presets once, preserving saved controls, ordering and failures', async () => {
  const db = crypto.randomUUID();
  const first = open(db);
  const prepared = prepareAbrBrush(asset);
  const original = {
    id: 'first',
    created: 1,
    name: 'Renamed ink',
    abrSource: asset,
    settings: { engine: prepared.engine, size: 70 },
    resourceIds: [prepared.resource.id]
  };
  const changed = structuredClone(original);
  changed.settings.engine.settings.values.diameter = 50;
  await first.storage.putPresets(
    [
      original,
      { ...changed, id: 'second', created: 2 },
      { ...original, id: 'copy', created: 3, abrSource: undefined },
      { ...original, id: 'broken', created: 4, abrSource: { ...asset, tipImage: undefined } }
    ],
    [prepared.resource]
  );
  for (let pass = 0; pass < 2; pass++) {
    const s = open(db);
    const writes = vi.spyOn(s.storage, 'putPreset');
    await Promise.all([s.library.load('first'), s.library.loadAll()]);
    flush();
    expect(writes).toHaveBeenCalledTimes(pass === 0 ? 3 : 0);
    expect(s.onError).toHaveBeenCalledTimes(1);
    const list = s.library.presets().filter((p) => !p.builtIn);
    expect(list.map((p) => p.id)).toEqual(['first', 'second', 'copy', 'broken']);
    expect(list.map((p) => !!p.abrDocument)).toEqual([true, true, true, false]);
    expect(JSON.stringify(list[0]?.abrSource)).toEqual(JSON.stringify(asset));
    expect(list[1]?.settings).toMatchObject({ size: 70, engine: { settings: { values: { diameter: 50 } } } });
    expect(list[1]?.resourceIds).toEqual(list[0]?.assetIds);
    expect(await s.storage.readResources(original.resourceIds)).toHaveLength(1);
  }
});

it.each([false, true])(
  'migrates a prepared ABR preset once with identical engine inputs (dual enabled: %s)',
  async (dualEnabled) => {
    const db = crypto.randomUUID();
    const { storage } = open(db);

    const { engine, resource } = prepareAbrBrush(asset);
    const name = "Kyle's Drawing Box - Animator Pencil 2016";
    const pattern = { ...resource, id: 'pattern', pixels: Uint8Array.of(22, 33) };
    const dual = { ...resource, id: 'dual', pixels: Uint8Array.of(4, 3) };
    const values = {
      ...engine.settings.values,
      name,
      diameter: 7,
      angle: 39,
      spacing: 1,
      useTexture: true,
      useShapeDynamics: true,
      useScattering: true,
      useTransfer: true,
      useSmoothing: true,
      texture: { ...engine.settings.values.texture, patternId: 'pattern-uuid', brightness: -122, depth: 22 },
      useDualBrush: dualEnabled,
      dualBrush: { ...engine.settings.values.dualBrush, tipId: 'dual-uuid', angle: 21 }
    };
    const settings = { ...engine.settings, values, patternId: pattern.id, dualId: dualEnabled ? dual.id : undefined };
    const original = {
      id: 'pencil',
      name,
      source: 'abr:3120ea76-a970-4d12-9aa6-c9b114a48ab9',
      created: 123,
      settings: { size: 7, engine: { id: 'abr', settings } },
      resourceIds: [resource.id, pattern.id, ...(dualEnabled ? [dual.id] : [])]
    };
    await storage.putPreset(original, [resource, pattern, ...(dualEnabled ? [dual] : [])]);
    const broken = { ...original, id: 'missing', resourceIds: [pattern.id] };
    await storage.putPreset(broken);
    for (let run = 0; run < 2; run++) {
      const { library, storage: reader, editor, tools, onError } = open(db);
      const write = vi.spyOn(reader, 'putPreset');
      await Promise.all([library.load(original.id), library.loadAll()]);
      const migrated = library.find(original.id)!;
      expect(migrated.abrDocument, JSON.stringify(onError.mock.calls)).toBeDefined();
      tools.selectPreset(original.id, 'brush');
      flush();
      expect(editor.view()?.values.useSmoothing).toBe(true);
      const resolved = await resolveAbrText(migrated.abrDocument!, (await library.assets(migrated))._unsafeUnwrap());
      expect(resolved.engine).toEqual({
        id: 'abr',
        settings: {
          ...settings,
          tipId: await assetId(resource),
          patternId: await assetId(pattern),
          dualId: dualEnabled ? await assetId(dual) : undefined
        }
      });
      expect(migrated.settings).toEqual({ size: 7, engine: resolved.engine });
      expect(await reader.readPreset(original.id)).toMatchObject({
        id: original.id,
        name,
        source: original.source,
        created: original.created,
        abrDocument: migrated.abrDocument
      });
      expect(library.find(broken.id)?.abrDocument).toBeUndefined();
      expect(library.find(broken.id)?.settings).toEqual(broken.settings);
      expect(await reader.readPreset(broken.id)).toEqual(broken);
      expect(write).toHaveBeenCalledTimes(run ? 0 : 1);
      expect(onError).toHaveBeenCalledTimes(1);
    }
  }
);

it('copies, edits, saves, reloads and round-trips a Photoshop document and releases its last image', async () => {
  const db = crypto.randomUUID();
  const s = open(db);
  const item = await convertAbr(asset);
  const source = await s.library.importPreset({ ...item.preset, source: 'abr:one' }, item.resources);
  s.tools.selectPreset(source.id, 'brush');
  flush();
  const copy = s.tools.savePresetAs('Copy');
  flush();
  expect(copy.derivedFrom).toBe(source.id);
  const update = async (enabled: boolean, jitter: number) => {
    const view = s.editor.view()!;
    await s.editor.update(
      patchFormValues(view.text, {
        ...view.values,
        useShapeDynamics: enabled,
        shapeDynamics: { ...view.values.shapeDynamics, sizeJitter: jitter }
      })
    );
    flush();
  };
  const originalRead = s.library.assets;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(s.library, 'assets').mockImplementationOnce(async (p) => {
    await waiting;
    return originalRead(p);
  });
  const slow = update(true, 20);
  await update(true, 75);
  release();
  await slow;
  await update(false, 75);
  expect(s.editor.editError()).toBe('');
  s.tools.savePreset();
  await s.storage.idle();
  const reopened = open(db);
  const saved = (await reopened.library.load(copy.id))!;
  expect(saved.settings.engine?.settings).toMatchObject({
    values: { useShapeDynamics: false, shapeDynamics: { sizeJitter: 75 } }
  });
  const bytes = await exportPaintbrush(saved, (await reopened.library.assets(saved))._unsafeUnwrap());
  reopened.library.remove(copy.id);
  await reopened.storage.idle();
  expect(await importPaintbrush(bytes, reopened.library)).toEqual([]);
  const imported = reopened.library.find(copy.id)!;
  expect(imported.settings).toEqual(saved.settings);
  expect(imported.assetIds).toEqual(source.assetIds);
  reopened.library.remove(source.id);
  await reopened.storage.idle();
  expect(await reopened.storage.readResources(imported.resourceIds)).toHaveLength(1);
  reopened.library.remove(imported.id);
  await reopened.storage.idle();
  expect(await reopened.storage.readResources(imported.resourceIds)).toBeUndefined();
});

it('aborts a Photoshop import before publishing records or images', async () => {
  const s = open(crypto.randomUUID());
  const item = await convertAbr(asset);
  const broken = { ...item.resources[0]!, uncloneable: () => {} };
  await expect(
    s.library.importPreset({ ...item.preset, source: 'abr:one' }, [...item.resources, broken])
  ).rejects.toThrow(/saved/);
  expect(await s.storage.readPresets()).toEqual([]);
  expect(await s.storage.readResources(item.preset.resourceIds)).toBeUndefined();
  expect(s.library.presets().every((p) => p.builtIn)).toBe(true);
});

it('restores an unsaved generated mask, copies it and reopens it under the same GPU id', async () => {
  const name = crypto.randomUUID();
  const first = open(name);
  await first.tools.loaded;
  const computed: BrushAsset = {
    ...asset,
    tipImage: undefined,
    preset: { ...asset.preset, tip: { kind: 'computed', diameter: pixels(30) } }
  };
  const item = await convertAbr(computed);
  const [source, replaced] = await Promise.all(
    [0, 1].map(() => first.library.importPreset({ ...item.preset, source: 'abr:same' }, item.resources))
  );
  expect(source!.id).toBe(replaced!.id);
  first.tools.selectPreset(source!.id, 'brush');
  flush();
  const view = first.editor.view()!;
  await first.editor.update(patchFormValues(view.text, { ...view.values, hardness: 21 }));
  flush();
  const id = first.tools.editedResources(source!.id)![0]!.id;
  expect(source!.resourceIds).not.toContain(id);
  await first.storage.idle();
  const second = open(name);
  await second.tools.loaded;
  flush();
  expect(second.tools.editedResources(source!.id)?.map((r) => r.id)).toEqual([id]);
  expect(abrValues(second.tools.brush()).hardness).toBe(21);
  const copy = second.tools.savePresetAs('Soft copy');
  expect(copy.resourceIds).toEqual([id]);
  await second.storage.idle();
  const third = open(name);
  const saved = await third.library.load(copy.id);
  expect(saved?.settings.engine?.settings).toMatchObject({ tipId: id, values: { hardness: 21 } });
  expect((await third.library.resources(saved!))._unsafeUnwrap().map((r) => r.id)).toEqual([id]);
});

it('exports a clear-mode eraser copy with editable Clear tool options', async () => {
  const s = open(crypto.randomUUID());
  const item = await convertAbr(asset);
  const source = await s.library.importPreset({ ...item.preset, source: 'abr:ink' }, item.resources);
  s.tools.selectPreset(source.id, 'brush');
  s.tools.chooseTool('eraser');
  const copy = s.tools.savePresetAs('Ink eraser');
  expect(copy.settings.engine?.settings).toMatchObject({ blendMode: 'Cler', values: { tool: { mode: 'Cler' } } });
  const other = open(crypto.randomUUID());
  const bytes = await exportPaintbrush(copy, (await s.library.assets(copy))._unsafeUnwrap());
  expect(await importPaintbrush(bytes, other.library)).toEqual([]);
  expect(other.library.find(copy.id)?.settings).toEqual(copy.settings);
});

/** The Photoshop values of a brush the ABR renderer draws. */
function abrValues(brush: Brush) {
  return (brush.engine!.settings as AbrBrushSettings).values;
}
