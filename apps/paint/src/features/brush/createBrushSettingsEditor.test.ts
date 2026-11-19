// @vitest-environment jsdom
import type { BrushAsset } from '@app-game/abr-brush/library';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import { initAbr, pixels } from '@app-game/abr-parser';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import 'fake-indexeddb/auto';
import { ok } from 'neverthrow';
import { Blob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LegoServices } from '../../variants/lego/LegoServices';
import { brushChannels } from '../../variants/lego/parts/brushChannels';
import { getBrushSetting } from '../brush-editor/schema';
import { convertAbr } from '../brush-library/abrPresetDocument';
import { createBrushLibrary } from '../brush-library/createBrushLibrary';
import { createBrushStorage } from '../brush-library/createBrushStorage';
import { exportPaintbrush, importPaintbrush } from '../brush-library/paintbrushFile';
import { resolveDocument } from '../brush-library/resolveDocument';
import type { PaintSession } from '../session';
import { createBrushSettingsEditor } from './createBrushSettingsEditor';
import { createBrushTools } from './createBrushTools';

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

const photoshopAsset: BrushAsset = {
  id: 'computed',
  name: 'Computed',
  source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() },
  resources: [],
  preset: { kind: 'brush', sourceId: 'one', tip: { kind: 'computed', diameter: pixels(30) } }
};

/** A brush editing scope over the library stored under `name`, as the app has it. */
function open(name: string) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const onError = vi.fn();
    const storage = createBrushStorage({ name, onError });
    const library = createBrushLibrary({ storage, onError });
    const tools = createBrushTools({ library, storage });
    const engine = { putResources: vi.fn(async () => ok(undefined)) };
    const editor = createBrushSettingsEditor({ tools, brush: tools.brush, library, engine } as unknown as PaintSession);
    // What the board's parts read and write: its own Size and Opacity, and the studio's settings through the editor.
    const services = {
      brushEditor: editor,
      brush: { size: () => tools.brush().size, opacity: () => tools.brush().opacity, update: tools.updateBrush }
    } as unknown as LegoServices;
    return { storage, library, tools, editor, engine, services, onError };
  });
}

/** Writes `value` to the studio row `id` and waits for the edit to be published. */
async function studio(s: ReturnType<typeof open>, id: string, value: number | boolean | string) {
  const setting = getBrushSetting(id)!;
  const view = s.editor.view()!;
  await s.editor.update(
    setting.kind === 'number'
      ? setting.write(view, value as number)
      : setting.kind === 'toggle'
        ? setting.write(view, value as boolean)
        : setting.write(view, value as string)
  );
  flush();
  expect(s.editor.editError()).toBe('');
}

/** The value the studio row `id` shows now. */
function row(s: ReturnType<typeof open>, id: string) {
  return getBrushSetting(id)!.read(s.editor.view()!);
}

/** The board's part for the studio row `id`. */
function part(id: string) {
  return brushChannels.find((channel) => channel.id === `brush:${id}`)!;
}

/** What the renderer receives for the brush document the studio shows now. */
async function rendered(s: ReturnType<typeof open>) {
  const view = s.editor.view()!;
  const resolved = await resolveDocument(view.document, new Map(), s.tools.brush());
  return {
    brush: resolved.brush!,
    values: (resolved.settings?.engine?.settings as AbrBrushSettings | undefined)?.values
  };
}

it('keeps the shared settings of a round brush and a Photoshop preset as one value in the studio, on the board and for the renderer', async () => {
  const s = open(crypto.randomUUID());
  await s.tools.loaded;
  const item = await convertAbr(photoshopAsset);
  const preset = await s.library.importPreset({ ...item.preset, source: 'abr:computed' }, item.resources);
  for (const id of ['builtin:soft-round', preset.id]) {
    s.tools.selectPreset(id, 'brush');
    flush();
    const photoshop = id === preset.id;

    // Size: the studio row is the board's Size.
    await studio(s, 'size', 64);
    expect(s.tools.brush().size).toBe(64);
    expect((await rendered(s)).brush.size).toBe(64);
    s.tools.updateBrush({ size: 80 });
    flush();
    expect(row(s, 'size')).toBe(80);
    expect((await rendered(s)).brush.size).toBe(80);
    await studio(s, 'abr-tip-angle', 10);
    expect(s.tools.brush().size).toBe(80);

    // Opacity: the studio row is the board's Opacity.
    await studio(s, 'opacity', 40);
    expect(s.tools.brush().opacity).toBeCloseTo(0.4);
    s.tools.updateBrush({ opacity: 0.7 });
    flush();
    expect(row(s, 'opacity')).toBeCloseTo(70);
    expect((await rendered(s)).brush.opacity).toBeCloseTo(0.7);

    // Flow, hardness and spacing: the board's parts and the studio rows are one.
    for (const [key, value] of [
      ['flow', 55],
      ['hardness', 30],
      ['spacing', 20]
    ] as const) {
      await studio(s, key, value);
      expect(part(key).read(s.services), key).toBeCloseTo(value);
      await part(key).write(s.services, value + 5, { h: 0, s: 0, v: 0 });
      flush();
      expect(row(s, key), key).toBeCloseTo(value + 5);
      const { brush, values } = await rendered(s);
      const drawn = photoshop && key !== 'flow' ? values![key] : brush[key] * 100;
      expect(drawn, key).toBeCloseTo(value + 5);
      expect(photoshop ? s.tools.brush().engine?.id : s.tools.brush()[key] * 100, key).toBe(photoshop ? 'abr' : drawn);
    }
  }

  // A round brush's pressure on size is Shape dynamics under Pen pressure.
  s.tools.selectPreset('builtin:soft-round', 'brush');
  flush();
  expect(s.tools.brush().pressureSize).toBe(true);
  await studio(s, 'abr-shapeDynamics-useShapeDynamics', false);
  expect(s.tools.brush().pressureSize).toBe(false);
  expect(s.tools.brush().engine).toBeUndefined();
  expect((await rendered(s)).brush.pressureSize).toBe(false);
});

it('moves Soft round to the ABR renderer with scattering, and Cancel restores the document it opened with', async () => {
  const s = open(crypto.randomUUID());
  await s.tools.loaded;
  s.tools.selectPreset('builtin:soft-round', 'brush');
  flush();
  const checkpoint = s.editor.checkpoint();
  await studio(s, 'abr-scattering-useScattering', true);
  await studio(s, 'abr-scattering-scatter', 150);
  expect(s.tools.brush().engine?.id).toBe('abr');
  expect(s.editor.view()!.photoshopPath).toBe(true);
  expect(s.editor.changedSince(checkpoint)).toBe(true);

  await studio(s, 'abr-scattering-useScattering', false);
  expect(s.tools.brush().engine).toBeUndefined();
  expect(row(s, 'abr-scattering-scatter')).toBe(150);
  await studio(s, 'abr-scattering-useScattering', true);
  expect(row(s, 'abr-scattering-scatter')).toBe(150);

  s.editor.revert(checkpoint);
  flush();
  expect(s.tools.brush().engine).toBeUndefined();
  expect(s.tools.documentEdit('builtin:soft-round')).toBeUndefined();
  expect(row(s, 'abr-scattering-useScattering')).toBe(false);
  expect(row(s, 'abr-scattering-scatter')).toBe(0);
  expect(s.editor.changedSince(checkpoint)).toBe(false);
});

it('saves a round brush with scattering on as a copy that survives reload, export and re-import', async () => {
  const db = crypto.randomUUID();
  const s = open(db);
  await s.tools.loaded;
  s.tools.selectPreset('builtin:soft-round', 'brush');
  flush();
  await studio(s, 'abr-scattering-useScattering', true);
  await studio(s, 'abr-scattering-scatter', 150);
  await studio(s, 'size', 48);
  const copy = s.tools.savePresetAs('Scattered round');
  flush();
  expect(copy.settings.engine?.id).toBe('abr');
  await s.storage.idle();

  const reopened = open(db);
  const saved = (await reopened.library.load(copy.id))!;
  expect(saved.abrDocument).toBeDefined();
  const document = parseDocument(saved.abrDocument!, brushSchema);
  expect(document.definition.size).toBe(48);
  expect(document.definition.extensions?.['photoshop.scattering.v1']?.value).toMatchObject({
    scatteringEnabled: true,
    'scatterDynamics.jitter': 150
  });
  expect(document.definition.extensions?.['paint.abr-host.v1']).toBeUndefined();
  await reopened.tools.loaded;
  reopened.tools.selectPreset(copy.id, 'brush');
  flush();
  expect(reopened.tools.brush().engine?.id).toBe('abr');
  expect(row(reopened, 'abr-scattering-scatter')).toBe(150);
  expect(row(reopened, 'size')).toBe(48);

  const bytes = await exportPaintbrush(saved, (await reopened.library.assets(saved))._unsafeUnwrap());
  const other = open(crypto.randomUUID());
  expect(await importPaintbrush(bytes, other.library)).toEqual([]);
  const imported = other.library.find(copy.id)!;
  expect(imported.settings.engine?.id).toBe('abr');
  const resolved = await resolveDocument(parseDocument(imported.abrDocument!, brushSchema), new Map());
  expect(resolved).toMatchObject({ path: 'abr', status: 'supported' });
  expect((resolved.settings!.engine!.settings as AbrBrushSettings).values.scattering.scatter).toBe(150);
});

it('saves a round brush with scattering dormant as one that draws round and keeps the values', async () => {
  const db = crypto.randomUUID();
  const s = open(db);
  await s.tools.loaded;
  s.tools.selectPreset('builtin:soft-round', 'brush');
  flush();
  await studio(s, 'abr-scattering-useScattering', true);
  await studio(s, 'abr-scattering-scatter', 150);
  await studio(s, 'abr-scattering-useScattering', false);
  const copy = s.tools.savePresetAs('Dormant round');
  flush();
  expect(copy.settings.engine).toBeUndefined();
  await s.storage.idle();

  const reopened = open(db);
  await reopened.library.load(copy.id);
  await reopened.tools.loaded;
  reopened.tools.selectPreset(copy.id, 'brush');
  flush();
  expect(reopened.tools.brush().engine).toBeUndefined();
  expect(row(reopened, 'abr-scattering-useScattering')).toBe(false);
  expect(row(reopened, 'abr-scattering-scatter')).toBe(150);
  await studio(reopened, 'abr-scattering-useScattering', true);
  expect(reopened.tools.brush().engine?.id).toBe('abr');
});

it('saves a brush with a computed second tip switched on as a copy that survives reload, export and re-import', async () => {
  const db = crypto.randomUUID();
  const s = open(db);
  await s.tools.loaded;
  const item = await convertAbr(photoshopAsset);
  const preset = await s.library.importPreset({ ...item.preset, source: 'abr:computed' }, item.resources);
  for (const id of ['builtin:soft-round', preset.id]) {
    s.tools.selectPreset(id, 'brush');
    flush();
    await studio(s, 'abr-dualBrush-useDualBrush', true);
    await studio(s, 'abr-dualBrush-diameter', 18);
    await studio(s, 'abr-dualBrush-hardness', 40);
    expect(s.tools.brush().engine?.id, id).toBe('abr');
    const dualId = (s.tools.brush().engine!.settings as AbrBrushSettings).dualId;
    expect(dualId, id).toBeDefined();
    expect(s.engine.putResources).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: dualId })])
    );
    const copy = s.tools.savePresetAs('Dual ' + id);
    flush();
    expect(copy.settings.engine?.id, id).toBe('abr');
    await s.storage.idle();

    const reopened = open(db);
    const saved = (await reopened.library.load(copy.id))!;
    // The second tip is generated from its parameters, so the document stores no image for it.
    const document = parseDocument(saved.abrDocument!, brushSchema);
    expect(Object.keys(document.definition.resources ?? {}), id).not.toContain('secondary');
    await reopened.tools.loaded;
    reopened.tools.selectPreset(copy.id, 'brush');
    flush();
    expect(reopened.tools.brush().engine?.id, id).toBe('abr');
    expect(row(reopened, 'abr-dualBrush-useDualBrush'), id).toBe(true);
    expect(row(reopened, 'abr-dualBrush-diameter'), id).toBe(18);
    expect(row(reopened, 'abr-dualBrush-hardness'), id).toBe(40);

    const bytes = await exportPaintbrush(saved, (await reopened.library.assets(saved))._unsafeUnwrap());
    const other = open(crypto.randomUUID());
    expect(await importPaintbrush(bytes, other.library)).toEqual([]);
    const imported = other.library.find(copy.id)!;
    expect(imported.settings.engine?.id, id).toBe('abr');
    const resolved = await resolveDocument(
      parseDocument(imported.abrDocument!, brushSchema),
      new Map((await other.library.assets(imported))._unsafeUnwrap().map((image) => [image.id, image]))
    );
    expect(resolved, id).toMatchObject({ path: 'abr', status: 'supported' });
    const settings = resolved.settings!.engine!.settings as AbrBrushSettings;
    expect(settings.values.useDualBrush, id).toBe(true);
    expect(settings.values.dualBrush, id).toMatchObject({ diameter: 18, hardness: 40 });
    expect(settings.dualId, id).toBe(dualId);
  }
});
