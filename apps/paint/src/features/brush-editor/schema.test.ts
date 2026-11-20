import type { BrushAsset } from '@app-game/abr-brush/library';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import { initAbr, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { brushSchema, parseDocument, patch } from '@app-game/paint-core/paintbrush/document';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { describe, expect, it } from 'vitest';
import { convertAbr } from '../brush-library/abrPresetDocument';
import { builtInPresets } from '../brush-library/brushPresets';
import { roundDocumentText } from '../brush-library/documentSettings';
import { resolveDocument } from '../brush-library/resolveDocument';
import { brushView, type BrushView } from './brushView';
import {
  brushCategories,
  getBrushSetting,
  numberSettings,
  replacedSettings,
  type BrushSetting,
  type NumberSetting
} from './schema';

await initAbr();

const source: BrushAsset = {
  id: 'test',
  name: 'Test',
  preset: { kind: 'brush', sourceId: 'one', tip: { kind: 'computed', diameter: pixels(30) } },
  resources: [],
  source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
};

/** Soft round's view, as the studio opens it. */
function softRound(stroke: Partial<StrokeSettings> = {}): BrushView {
  const live = { ...defaultBrush(), stroke: normalizeStrokeSettings({ ...defaultBrush().stroke, ...stroke }) };
  return brushView(roundDocumentText(builtInPresets[0], live), live);
}

/** A computed Photoshop preset's view, as imported. */
async function photoshop(): Promise<BrushView> {
  const { preset } = await convertAbr(source);
  return brushView(preset.abrDocument, { ...defaultBrush(), ...preset.settings });
}

/** The view after a row wrote `text`, as the studio shows it while the edit resolves. */
function after(view: BrushView, text: string) {
  return brushView(text, view.brush);
}

/** The rows of the registry that apply to `view`, by category, each with whether it is enabled. */
function rows(view: BrushView) {
  return Object.fromEntries(
    brushCategories
      .filter((category) => category.applies(view))
      .map((category) => [
        category.id,
        category.settings
          .filter((setting) => setting.applies(view))
          .map((setting) => (setting.enabled(view) ? setting.id : `(${setting.id})`))
      ])
  );
}

const switches = ['scattering', 'texture', 'dualBrush', 'colorDynamics', 'transfer', 'brushPose'] as const;

describe('the brush studio registry', () => {
  it('has unique IDs and finds every setting, and every replaced ID by its replacement', () => {
    const settings = brushCategories.flatMap((category) => category.settings);
    expect(new Set(settings.map((setting) => setting.id)).size).toBe(settings.length);
    expect(brushCategories.map((category) => category.id)).toEqual([
      'painting',
      'brush-tip',
      'shapeDynamics',
      'transfer',
      'scattering',
      'texture',
      'dualBrush',
      'colorDynamics',
      'brushPose',
      'stroke-correction',
      'bristle',
      'erodible'
    ]);
    for (const setting of settings) {
      expect(getBrushSetting(setting.id)).toBe(setting);
    }
    for (const [old, current] of Object.entries(replacedSettings)) {
      expect(settings.some((setting) => setting.id === old)).toBe(false);
      expect(getBrushSetting(old)).toBe(getBrushSetting(current));
    }
    expect(getBrushSetting('missing')).toBeUndefined();
  });

  it('shows a plain round brush every Photoshop group, switched off but for its pressure on size', () => {
    const view = softRound();
    const shown = rows(view);
    expect(Object.keys(shown)).toEqual([
      'painting',
      'brush-tip',
      'shapeDynamics',
      'transfer',
      'scattering',
      'texture',
      'dualBrush',
      'colorDynamics',
      'brushPose',
      'stroke-correction'
    ]);
    expect(shown.painting).toEqual([
      'size',
      'abr-tool-mode',
      'opacity',
      'flow',
      'color-mixing',
      'abr-tool-pressureOverridesOpacity',
      'abr-tool-pressureOverridesSize'
    ]);
    expect(shown['brush-tip']).toEqual(['spacing', 'abr-tip-angle', 'abr-tip-roundness', 'hardness']);
    // Soft round's size follows pressure: Paint's pressure binding reads as Shape dynamics under Pen pressure.
    expect(view.values.useShapeDynamics).toBe(true);
    expect(view.values.shapeDynamics).toMatchObject({ sizeControl: 2, minimumDiameter: 4 });
    for (const id of switches) {
      const category = brushCategories.find((c) => c.id === id)!;
      expect(category.status(view), id).toBe('Off');
      expect(category.settings[0]!.read(view), id).toBe(false);
      expect(
        category.settings.slice(1).every((setting) => !setting.enabled(view)),
        id
      ).toBe(true);
    }
    expect(view.photoshopPath).toBe(false);
  });

  it('shows a Photoshop preset its rows, with the shared ones once', async () => {
    const view = await photoshop();
    const shown = rows(view);
    expect(shown.painting!.slice(0, 5)).toEqual(['size', 'abr-tool-mode', 'opacity', 'flow', 'color-mixing']);
    expect(shown['brush-tip']).toEqual(['spacing', 'abr-tip-angle', 'abr-tip-roundness', 'hardness']);
    expect(shown.dualBrush![0]).toBe('abr-dualBrush-useDualBrush');
    expect(shown.texture![0]).toBe('(abr-texture-useTexture)');
    expect(shown['stroke-correction']).toEqual(
      expect.arrayContaining(['smoothing', 'abr-smoothing-amount', '(abr-smoothing-pulledString)'])
    );
    expect(view.photoshopPath).toBe(true);
  });

  it('moves Soft round to the ABR renderer with scattering, keeps its values dormant when off, and back', async () => {
    const round = softRound();
    const use = toggle('abr-scattering-useScattering');
    const on = after(round, use.write(round, true));
    expect(on.photoshopPath).toBe(true);
    expect(await resolveDocument(on.document, new Map(), round.brush)).toMatchObject({ path: 'abr' });
    const spread = after(on, numeric('abr-scattering-scatter').write(on, 150));
    expect(numeric('abr-scattering-scatter').read(spread)).toBe(150);

    const off = after(spread, use.write(spread, false));
    expect(off.photoshopPath).toBe(false);
    expect(await resolveDocument(off.document, new Map(), round.brush)).toMatchObject({ path: 'round' });
    expect(numeric('abr-scattering-scatter').read(off)).toBe(150);
    expect(numeric('abr-scattering-scatter').enabled(off)).toBe(false);

    const again = after(off, use.write(off, true));
    expect(again.photoshopPath).toBe(true);
    expect(numeric('abr-scattering-scatter').read(again)).toBe(150);
  });

  it('keeps Paint’s pressure binding while Shape dynamics says no more than it, and its values dormant when off', () => {
    const round = softRound();
    const use = toggle('abr-shapeDynamics-useShapeDynamics');
    const off = after(round, use.write(round, false));
    expect(off.photoshopPath).toBe(false);
    expect(off.brush.pressureSize).toBe(false);
    expect(off.values.shapeDynamics.sizeControl).toBe(2);
    const on = after(off, use.write(off, true));
    expect(on.brush.pressureSize).toBe(true);
    expect(on.photoshopPath).toBe(false);
    expect(on.document.definition.extensions?.['photoshop.shape-dynamics.v1']).toBeUndefined();
    const jitter = after(on, numeric('abr-shapeDynamics-sizeJitter').write(on, 30));
    expect(jitter.photoshopPath).toBe(true);
    expect(jitter.values.shapeDynamics).toMatchObject({ sizeJitter: 30, sizeControl: 2, minimumDiameter: 4 });
    const back = after(jitter, numeric('abr-shapeDynamics-sizeJitter').write(jitter, 0));
    expect(back.photoshopPath).toBe(false);
    expect(back.brush.pressureSize).toBe(true);
  });

  it('returns a round brush to Paint’s renderer when a Photoshop tool value is set back', () => {
    const round = softRound();
    const mode = choice('abr-tool-mode');
    const multiply = after(round, mode.write(round, 'Mltp'));
    expect(multiply.photoshopPath).toBe(true);
    expect(after(multiply, mode.write(multiply, 'Nrml')).photoshopPath).toBe(false);
  });

  it('cannot switch on a texture without its pattern, and shows it as stored', async () => {
    for (const view of [softRound(), await photoshop()]) {
      const setting = toggle('abr-texture-useTexture');
      expect(setting.enabled(view)).toBe(false);
      expect(setting.read(view)).toBe(false);
    }
    expect(brushCategories.find((c) => c.id === 'texture')!.status(softRound())).toBe('Off');
  });

  it('switches on a dual brush without a stored second tip, which then draws a computed one', async () => {
    for (const view of [softRound(), await photoshop()]) {
      expect(view.images.dual).toBe(false);
      const use = toggle('abr-dualBrush-useDualBrush');
      expect(use.enabled(view)).toBe(true);
      const on = after(view, use.write(view, true));
      expect(on.photoshopPath).toBe(true);
      expect(rows(on).dualBrush!.filter((id) => id.startsWith('('))).toEqual([]);
      const soft = after(on, numeric('abr-dualBrush-hardness').write(on, 40));
      const resolved = await resolveDocument(soft.document, new Map(), view.brush);
      expect(resolved.path).toBe('abr');
      const settings = resolved.settings!.engine!.settings as AbrBrushSettings;
      expect(settings.values.useDualBrush).toBe(true);
      expect(settings.values.dualBrush.hardness).toBe(40);
      expect(resolved.resources!.map((image) => image.id)).toContain(settings.dualId);

      const off = after(soft, use.write(soft, false));
      expect(off.photoshopPath).toBe(view.photoshopPath);
      expect(numeric('abr-dualBrush-hardness').read(off)).toBe(40);
    }
  });

  it('cannot switch on a dual brush whose sampled second tip the document names but lacks', async () => {
    const view = await photoshop();
    const named = after(
      view,
      patch(view.text, '/definition/extensions/photoshop.dual-brush.v1', {
        impact: 'appearance',
        value: { 'dualBrush.tip.sampleId': 'missing' }
      })
    );
    expect(named.values.dualBrush.tipId).toBe('missing');
    expect(toggle('abr-dualBrush-useDualBrush').enabled(named)).toBe(false);
  });

  it('writes Paint’s shared settings in one place of each kind of document', async () => {
    for (const view of [softRound(), await photoshop()]) {
      const write = (id: string, value: number) => after(view, numeric(id).write(view, value));
      expect(numeric('size').read(write('size', 64))).toBe(64);
      expect(numeric('opacity').read(write('opacity', 40))).toBeCloseTo(40);
      expect(numeric('flow').read(write('flow', 55))).toBeCloseTo(55);
      expect(numeric('hardness').read(write('hardness', 30))).toBeCloseTo(30);
      expect(numeric('spacing').read(write('spacing', 20))).toBeCloseTo(20);
    }
    const round = softRound();
    const d = parseDocument(numeric('size').write(round, 64), brushSchema).definition;
    expect(d.size).toBe(64);
    const preset = await photoshop();
    const ps = parseDocument(numeric('size').write(preset, 64), brushSchema).definition;
    // A Photoshop preset's diameter stays its reference for the second tip; the brush's size is Paint's.
    expect(ps.size).toBe(preset.document.definition.size);
    expect((ps.extensions!['paint.abr-host.v1']!.value as { size: number }).size).toBe(64);
  });

  it('clamps, rounds and round-trips every number row in UI units, for both kinds of brush', async () => {
    for (const view of [softRound(), await photoshop()]) {
      for (const setting of numberSettings(brushCategories.flatMap((category) => category.settings))) {
        if (!setting.applies(view)) {
          continue;
        }

        const readWrite = (value: number) => setting.read(after(view, setting.write(view, value)));
        expect(readWrite(-Infinity), setting.id).toBeCloseTo(setting.min(view));
        expect(readWrite(Infinity), setting.id).toBeCloseTo(setting.max(view));
        const value = Math.ceil(setting.min(view) / setting.step) * setting.step + setting.step;
        expect(readWrite(value), setting.id).toBeCloseTo(value);
        expect(readWrite(value + setting.step * 0.4), setting.id).toBeCloseTo(value);
      }
    }
  });

  it('round-trips every switch and choice, and rejects unknown options', () => {
    const view = softRound({ mode: 'stabilizer' });
    for (const setting of brushCategories.flatMap((category) => category.settings)) {
      if (!setting.applies(view)) {
        continue;
      }

      if (setting.kind === 'toggle') {
        expect(setting.read(after(view, setting.write(view, !setting.read(view)))), setting.id).toBe(
          !setting.read(view)
        );
      }

      if (setting.kind === 'choice') {
        for (const option of setting.options) {
          expect(setting.read(after(view, setting.write(view, option.value))), setting.id).toBe(option.value);
        }
        expect(() => setting.write(view, 'invalid')).toThrow(RangeError);
      }
    }
  });

  it('provides Paint’s ranges, steps, units, curves and named options', () => {
    const view = softRound();
    const paint = ['size', 'opacity', 'flow', 'spacing', 'hardness', 'smoothing'].map((id) => {
      const setting = numeric(id);
      return [id, setting.min(view), setting.max(view), setting.step, setting.unit];
    });
    expect(paint).toEqual([
      ['size', 1, 512, 1, 'px'],
      ['opacity', 1, 100, 1, '%'],
      ['flow', 1, 100, 1, '%'],
      ['spacing', 1, 1000, 1, '%'],
      ['hardness', 0, 100, 1, '%'],
      ['smoothing', 0, 22, 1, '']
    ]);
    expect(numeric('size').curve?.(view)).toBeDefined();
    expect(numeric('spacing').curve?.(view)).toBeDefined();
    expect(
      numeric('smoothing')
        .levels?.filter((level) => level.zone)
        .map((level) => level.value)
    ).toEqual([16, 17, 18, 19, 20, 21, 22]);
    expect(getBrushSetting('color-mixing')).toMatchObject({
      options: [
        { value: 'linear', label: 'Smooth color' },
        { value: 'classic', label: 'Classic' }
      ]
    });
  });

  it('carries no explanatory text: no option, category or row has a description, an about or a note', () => {
    for (const category of brushCategories) {
      expect(Object.keys(category).sort()).toEqual(['applies', 'group', 'id', 'label', 'settings', 'status']);
      for (const setting of category.settings) {
        if (setting.kind === 'choice') {
          for (const option of setting.options) {
            expect(Object.keys(option).sort()).toEqual(['label', 'value']);
          }
        }
      }
    }
  });

  it('summarizes painting, tips and correction modes of a round brush', () => {
    const status = (id: string, view = softRound()) =>
      brushCategories.find((category) => category.id === id)!.status(view);
    expect(status('painting')).toBe('32 px · 100%');
    expect(status('brush-tip')).toBe('Soft round · 65%');
    expect(status('shapeDynamics')).toBe('Pressure');
    const modes: StrokeSettings['mode'][] = ['none', 'studio', 'normal', 'smooth', 'stabilizer'];
    expect(modes.map((mode) => status('stroke-correction', softRound({ mode, stabilizer: 18 })))).toEqual([
      'Off',
      'Off',
      '1',
      '10',
      '18'
    ]);
    // Catch-up applies only while Smoothing trails.
    expect(toggle('catch-up').enabled(softRound({ mode: 'studio' }))).toBe(false);
    expect(toggle('catch-up').enabled(softRound({ mode: 'stabilizer' }))).toBe(true);
  });
});

function numeric(id: string): NumberSetting {
  return find(id, 'number') as NumberSetting;
}

function toggle(id: string) {
  return find(id, 'toggle') as Extract<BrushSetting, { kind: 'toggle' }>;
}

function choice(id: string) {
  return find(id, 'choice') as Extract<BrushSetting, { kind: 'choice' }>;
}

function find(id: string, kind: BrushSetting['kind']) {
  const setting = getBrushSetting(id);
  if (setting?.kind !== kind) {
    throw new Error(`Expected ${kind} setting ${id}`);
  }

  return setting;
}
