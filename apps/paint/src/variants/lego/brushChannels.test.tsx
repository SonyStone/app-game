// @vitest-environment jsdom
import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { abrCategories } from '../../features/brush-editor/abrSchema';
import { brushSettingName } from '../../features/brush-editor/brushSettingName';
import { brushCategories } from '../../features/brush-editor/schema';
import { removePart, type Board } from './board';
import { createBoard } from './createBoard';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { boxSections, partDefinition } from './parts';
import { brushChannels, brushSettingKind } from './parts/brushChannels';
import { roundedValue, unitSuffix } from './parts/values';
import { createTestServices } from './testServices';

it('generates unique names across both schemas, counting shared IDs once', () => {
  const categories = [...brushCategories, ...abrCategories];
  {
    const rows = [
      ...new Map(
        categories.flatMap((c) => c.settings.filter((s) => s.kind === 'number').map((s) => [s.id, { c, s }] as const))
      ).values()
    ];
    const names = rows.map(({ c, s }) => brushSettingName(c, s));
    expect(new Set(names).size).toBe(names.length);
    const named = (id: string) => names[rows.findIndex(({ s }) => s.id === id)];
    expect(named('pressure-minimum')).toBe('Pressure minimum');
    expect(named('abr-brushPose-tiltX')).toBe('Tilt X');
    expect(named('abr-colorDynamics-fade')).toBe('FG/BG fade length');
    expect(named('abr-shapeDynamics-sizeJitter')).toBe('Size jitter');
    for (const { s } of rows) {
      expect(partDefinition(brushSettingKind(s.id))).toBeDefined();
      expect(boxSections.flatMap((s) => s.kinds)).not.toContain(`value:brush:${s.id}`);
    }
  }
});

it('uses Paint and ABR range, units, curves and schema writes; unavailable channels ignore writes', async () => {
  let dispose!: () => void;
  const { services, brush, setBrush } = createRoot((stop) => {
    dispose = stop;
    return createTestServices();
  });
  try {
    const hsv = { h: 0, s: 1, v: 1 };
    const flow = brushChannels.find((s) => s.id === 'brush:flow')!;
    expect(flow.unit).toBe('%');
    expect(flow.max(services)).toBe(100);
    await flow.write(services, 35, hsv);
    flush();
    expect(flow.read(services)).toBe(35);
    const abr = brushChannels.find((s) => s.id === 'brush:abr-tip-angle')!;
    expect(abr.active!(services)).toBe(false);
    await abr.write(services, 45, hsv);
    expect(brush().engine).toBeUndefined();
    const source = {
      id: 'test',
      name: 'Test',
      preset: { tip: { kind: 'computed', diameter: 30 } },
      resources: []
    } as unknown as BrushAsset;
    setBrush({
      ...defaultBrush(),
      engine: { id: 'abr', settings: { tipId: 'tip', values: brushToFormValues(source) } }
    });
    flush();
    expect(abr.active!(services)).toBe(true);
    expect(abr.minimum!(services)).toBe(-180);
    expect(abr.max(services)).toBe(180);
    expect(abr.unit).toBe('°');
    await abr.write(services, 45, hsv);
    flush();
    expect(abr.read(services)).toBe(45);
    const disabled = brushChannels.find((s) => s.id === 'brush:stabilization')!;
    expect(disabled.active!(services)).toBe(false);
  } finally {
    dispose();
  }
});

it('reloads plates of brush setting parts made by the pin buttons, known kinds and removed ones alike', () => {
  localStorage.clear();
  const part = (id: string, kind: string, row: number) => ({
    id,
    kind,
    cell: { column: 0, row },
    span: { columns: 4, rows: 1 }
  });
  const stored: Board = {
    panels: [
      {
        id: 'brush-pins',
        floating: true,
        at: { x: 0.7, y: 0.15 },
        parts: [part('flow', 'value:brush:flow', 0), part('future', 'value:brush:removed-setting', 1)]
      }
    ]
  };
  let stop!: () => void;
  const saved = createRoot((dispose) => {
    stop = dispose;
    return createBoard();
  });
  saved.set(stored);
  stop();
  createRoot((dispose) => {
    const board = createBoard();
    const kinds = board.latest().panels.flatMap((panel) => panel.parts.map((p) => p.kind));
    expect(kinds).toEqual(['value:brush:flow', 'value:brush:removed-setting']);
    expect(partDefinition('value:brush:removed-setting')).toBeUndefined();
    // The pins' plate still goes with its last part.
    const loaded = board.latest();
    expect(removePart(removePart(loaded, 'flow'), 'future').panels).toHaveLength(0);
    dispose();
  });
  localStorage.clear();
});

it('keeps unavailable parts named and inert, and revives them when the brush supports them again', () => {
  let stop!: () => void;
  const { services, setBrush } = createRoot((dispose) => {
    stop = dispose;
    return createTestServices();
  });
  const host = document.createElement('div');
  document.body.append(host);
  const unmount = render(
    () => (
      <LegoServicesContext value={services}>
        <PartFrame kind="value:brush:hardness" span={{ columns: 4, rows: 1 }} />
        <PartFrame kind="value:brush:abr-tip-angle" span={{ columns: 4, rows: 1 }} />
      </LegoServicesContext>
    ),
    host
  );
  try {
    flush();
    expect(host.textContent).toContain('Angle');
    const hardness = host.querySelector('[data-part-kind="value:brush:hardness"]')!;
    expect(hardness.querySelector('[aria-disabled="false"]')).not.toBeNull();
    setBrush({ ...defaultBrush(), engine: { id: 'textured', settings: { tipId: 'test' } } });
    flush();
    expect(hardness.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(hardness.textContent).toContain('Hardness—');
    expect(hardness.textContent).not.toContain('Inactive');
    const input = hardness.querySelector('[role="slider"]')!;
    const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10 });
    input.dispatchEvent(press);
    input.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 20 }));
    expect(press.defaultPrevented).toBe(true);
    setBrush(defaultBrush());
    flush();
    expect(hardness.querySelector('[aria-disabled="false"]')).not.toBeNull();
  } finally {
    unmount();
    host.remove();
    stop();
  }
});

it('reuses the Size and Opacity parts for those settings and removes floating point noise', () => {
  for (const id of ['size', 'opacity']) {
    expect(partDefinition(`value:brush:${id}`)).toBeUndefined();
    expect(brushSettingKind(id)).toBe(`value:${id}`);
    expect(partDefinition(brushSettingKind(id))).toBeDefined();
  }

  expect(brushSettingKind('flow')).toBe('value:brush:flow');
  expect(roundedValue(0.30000000000000004, 0.1)).toBe(0.3);
  expect(roundedValue(1.234, 0.05)).toBe(1.25);
});

it('puts a space between a value and a unit that is a word, and none before a symbol', () => {
  expect(unitSuffix('marks')).toBe('\u00a0marks');
  for (const unit of ['%', '°', 'px', '']) {
    expect(unitSuffix(unit)).toBe(unit);
  }

  const fade = brushChannels.find((channel) => channel.id === 'brush:abr-shapeDynamics-sizeFade')!;
  expect(fade.format!(80)).toBe('80\u00a0marks');
  expect(brushChannels.find((channel) => channel.id === 'brush:flow')!.format!(35)).toBe('35%');
});
