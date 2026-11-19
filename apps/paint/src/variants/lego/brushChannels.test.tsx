// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { brushSettingName } from '../../features/brush-editor/brushSettingName';
import { brushCategories, numberSettings, replacedSettings } from '../../features/brush-editor/schema';
import { removePart, type Board } from './board';
import { createBoard } from './createBoard';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { boxSections, partDefinition } from './parts';
import { brushChannels, brushSettingKind } from './parts/brushChannels';
import { unitSuffix } from './parts/ValueEntry';
import { roundedValue } from './parts/values';
import { createTestServices } from './testServices';

it('generates unique names across the registry, keeping the names parts had', () => {
  const rows = brushCategories.flatMap((c) => numberSettings(c.settings).map((s) => ({ c, s })));
  const names = rows.map(({ c, s }) => brushSettingName(c, s));
  expect(new Set(names).size).toBe(names.length);
  const named = (id: string) => names[rows.findIndex(({ s }) => s.id === id)];
  expect(named('abr-brushPose-tiltX')).toBe('Tilt X');
  expect(named('abr-colorDynamics-fade')).toBe('FG/BG fade length');
  expect(named('abr-shapeDynamics-sizeJitter')).toBe('Size jitter');
  expect(named('spacing')).toBe('Tip spacing');
  expect(named('hardness')).toBe('Hardness');
  for (const { s } of rows) {
    expect(partDefinition(brushSettingKind(s.id))).toBeDefined();
    expect(boxSections.flatMap((s) => s.kinds)).not.toContain(`value:brush:${s.id}`);
  }
});

it('uses the registry’s ranges, units, curves and writes, for a round brush and its Photoshop groups', async () => {
  let dispose!: () => void;
  const { services, brush } = createRoot((stop) => {
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
    expect(brush().flow).toBeCloseTo(0.35);

    const angle = brushChannels.find((s) => s.id === 'brush:abr-tip-angle')!;
    expect(angle.active!(services)).toBe(true);
    expect(angle.minimum!(services)).toBe(-180);
    expect(angle.max(services)).toBe(180);
    expect(angle.unit).toBe('°');
    await angle.write(services, 45, hsv);
    flush();
    expect(angle.read(services)).toBe(45);
    expect(brush().engine).toBeUndefined();

    // A part of a switched-off group ignores writes until the group is on.
    const scatter = brushChannels.find((s) => s.id === 'brush:abr-scattering-scatter')!;
    expect(scatter.active!(services)).toBe(false);
    await scatter.write(services, 120, hsv);
    flush();
    expect(services.brushEditor.view()!.values.scattering.scatter).toBe(0);
  } finally {
    dispose();
  }
});

it('loads a board with every row ID a part was ever stored by, each a live part of the right setting and units', () => {
  // Every number row of Paint's and ABR's studio schemas before they became one registry (2026-11-19), and the
  // smoothing parts that were replaced before them.
  const old = [
    ...['size', 'opacity', 'flow', 'hardness', 'spacing', 'smoothing', 'stabilizer-level', 'stabilization'],
    ...['abr-tool-opacity', 'abr-tool-flow', 'abr-tool-strength', 'abr-tool-wetness', 'abr-tool-load', 'abr-tool-mix'],
    ...['abr-tip-diameter', 'abr-tip-spacing', 'abr-tip-angle', 'abr-tip-roundness', 'abr-tip-hardness'],
    ...['sizeJitter', 'minimumDiameter', 'sizeFade', 'tiltScale', 'sizeMinimum', 'angleJitter', 'angleFade'].map(
      (key) => `abr-shapeDynamics-${key}`
    ),
    ...['roundnessJitter', 'roundnessMinimum', 'roundnessFade', 'roundnessControlMinimum'].map(
      (key) => `abr-shapeDynamics-${key}`
    ),
    ...['opacity', 'flow', 'wetness', 'mix'].flatMap((name) =>
      ['Jitter', 'Minimum', 'Fade'].map((key) => `abr-transfer-${name}${key}`)
    ),
    ...['scatter', 'fade', 'count', 'countJitter', 'countFade'].map((key) => `abr-scattering-${key}`),
    ...['scale', 'brightness', 'contrast', 'depth', 'depthJitter', 'minimumDepth', 'depthFade'].map(
      (key) => `abr-texture-${key}`
    ),
    ...['diameter', 'hardness', 'spacing', 'angle', 'roundness', 'scatter', 'count'].map(
      (key) => `abr-dualBrush-${key}`
    ),
    ...['hueJitter', 'saturationJitter', 'brightnessJitter', 'purity', 'foregroundBackgroundJitter', 'fade'].map(
      (key) => `abr-colorDynamics-${key}`
    ),
    ...['tiltX', 'tiltY', 'rotation', 'pressure'].map((key) => `abr-brushPose-${key}`),
    'abr-smoothing-amount',
    ...['density', 'length', 'thickness', 'stiffness', 'clumping'].map((key) => `abr-bristle-${key}`),
    ...['softness', 'length', 'cutoff', 'granularity', 'streakiness', 'splatSize', 'splatCount'].map(
      (key) => `abr-erodible-${key}`
    )
  ];
  // The kind a part of each row was stored by: Size and Opacity always were the board's own.
  const kinds = old.map((id) => (id === 'size' || id === 'opacity' ? `value:${id}` : `value:brush:${id}`));
  localStorage.clear();
  let stop!: () => void;
  const saved = createRoot((dispose) => {
    stop = dispose;
    return createBoard();
  });
  saved.set({
    panels: [
      {
        id: 'brush-pins',
        floating: true,
        at: { x: 0.5, y: 0.1 },
        parts: kinds.map((kind, row) => ({
          id: `part-${row}`,
          kind,
          cell: { column: 0, row },
          span: { columns: 4, rows: 1 }
        }))
      }
    ]
  });
  stop();

  const { services } = createRoot((dispose) => {
    stop = dispose;
    return createTestServices();
  });
  // A Photoshop preset's merged rows now edit the setting every brush shares, in the same units.
  const units: Record<string, string> = { size: 'px', opacity: '%', flow: '%', hardness: '%', spacing: '%' };
  const host = document.createElement('div');
  document.body.append(host);
  const unmount = render(
    () => (
      <LegoServicesContext value={services}>
        {kinds.map((kind) => (
          <PartFrame kind={kind} span={{ columns: 6, rows: 1 }} />
        ))}
      </LegoServicesContext>
    ),
    host
  );
  try {
    flush();
    const loaded = createRoot((dispose) => {
      const board = createBoard();
      const parts = board.latest().panels.flatMap((panel) => panel.parts.map((part) => part.kind));
      dispose();
      return parts;
    });
    expect(loaded).toEqual(kinds);
    for (const [at, kind] of kinds.entries()) {
      const definition = partDefinition(kind);
      expect(definition, kind).toBeDefined();
      expect(host.querySelectorAll('[data-part-kind]')[at], kind).toBeDefined();
      const id = old[at]!;
      const current = Object.hasOwn(replacedSettings, id) ? replacedSettings[id]! : id;
      if (units[current]) {
        expect(definition!.kind, kind).toBe(brushSettingKind(current));
      }
    }
    for (const [old, current] of Object.entries(replacedSettings)) {
      expect(partDefinition(`value:brush:${old}`), old).toBe(partDefinition(brushSettingKind(current)));
      const channel = brushChannels.find((c) => `value:${c.id}` === brushSettingKind(current));
      expect(channel?.unit ?? units[current], old).toBe(units[current]);
    }
  } finally {
    unmount();
    host.remove();
    stop();
    localStorage.clear();
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
        <PartFrame kind="value:brush:hardness" span={{ columns: 6, rows: 1 }} />
        <PartFrame kind="value:brush:abr-tip-angle" span={{ columns: 6, rows: 1 }} />
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
