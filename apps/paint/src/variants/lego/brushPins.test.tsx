// @vitest-environment jsdom
import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { abrCategories } from '../../features/brush-editor/abrSchema';
import { brushCategories, brushSettingName } from '../../features/brush-editor/schema';
import { removePart } from './board';
import { brushPinned, toggleBrushPin } from './brushPins';
import { createBoard } from './createBoard';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { boxSections, partDefinition } from './parts';
import { brushChannels } from './parts/brushChannels';
import { createTestServices } from './testServices';

it('generates every numeric ID and unique standalone names in each schema', () => {
  for (const categories of [brushCategories, abrCategories]) {
    const rows = categories.flatMap((c) => c.settings.filter((s) => s.kind === 'number').map((s) => ({ c, s })));
    const names = rows.map(({ c, s }) => brushSettingName(c, s));
    expect(new Set(names).size).toBe(names.length);
    for (const { s } of rows) {
      expect(partDefinition(`value:brush:${s.id}`)).toBeDefined();
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
    const size = brushChannels.find((s) => s.id === 'brush:size')!;
    const at = size.toFraction!(30, size.max(services), services);
    expect(size.fromFraction!(at, size.max(services), services)).toBeCloseTo(30);
    const disabled = brushChannels.find((s) => s.id === 'brush:stabilization')!;
    expect(disabled.active!(services)).toBe(false);
  } finally {
    dispose();
  }
});

it('collects pins, removes duplicates across plates, and removes the last plate through either removal path', () => {
  const view = { width: 1646, height: 1029 };
  const first = toggleBrushPin({ panels: [] }, 'flow', view);
  const second = toggleBrushPin(first, 'hardness', view);
  expect(second.panels).toHaveLength(1);
  expect(second.panels[0]!.parts[1]!.cell.row).toBe(1);
  const removed = toggleBrushPin(second, 'flow', view);
  expect(brushPinned(removed, 'flow')).toBe(false);
  expect(toggleBrushPin(removed, 'hardness', view).panels).toHaveLength(0);
  expect(removePart(first, first.panels[0]!.parts[0]!.id).panels).toHaveLength(0);
  const duplicate = { panels: [...first.panels, { ...first.panels[0]!, id: 'another' }] };
  expect(brushPinned(toggleBrushPin(duplicate, 'flow', view), 'flow')).toBe(false);
});

it('reloads known and removed schema kinds through ordinary board storage', () => {
  localStorage.clear();
  const stored = toggleBrushPin({ panels: [] }, 'flow', { width: 1646, height: 1029 });
  stored.panels[0]!.parts.push({ ...stored.panels[0]!.parts[0]!, id: 'future', kind: 'value:brush:removed-setting' });
  let stop!: () => void;
  const saved = createRoot((dispose) => {
    stop = dispose;
    return createBoard();
  });
  saved.set(stored);
  stop();
  createRoot((dispose) => {
    const board = createBoard();
    expect(brushPinned(board.latest(), 'flow')).toBe(true);
    expect(brushPinned(board.latest(), 'removed-setting')).toBe(true);
    expect(partDefinition('value:brush:removed-setting')).toBeUndefined();
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
    expect(host.textContent).toContain('Brush tip · Angle');
    const hardness = host.querySelector('[data-part-kind="value:brush:hardness"]')!;
    expect(hardness.querySelector('[aria-disabled="false"]')).not.toBeNull();
    setBrush({ ...defaultBrush(), engine: { id: 'textured', settings: { tipId: 'test' } } });
    flush();
    expect(hardness.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(hardness.textContent).toContain('Brush tip · Hardness');
    const input = hardness.querySelector('[role="slider"]')!;
    input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10 }));
    input.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 20 }));
    setBrush(defaultBrush());
    flush();
    expect(hardness.querySelector('[aria-disabled="false"]')).not.toBeNull();
  } finally {
    unmount();
    stop();
  }
});
