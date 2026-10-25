// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createMemo, createRoot, createSignal, flush, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { StrokePreview } from '../../features/brush-library/StrokePreview';
import { createSheet } from './createSheet';
import { createKits } from './kits';
import { LegoServicesContext } from './LegoServices';
import { LookChooser } from './LookChooser';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import type { PartBinding, PartMode } from './parts/definition';
import { defineValuePart, type ValueChannel } from './parts/values';
import { BlockView, PartsTray } from './PartsTray';
import { createTestServices } from './testServices';

// The renderer is tested in paint-core; this suite exercises every real binding and controlled view.
const rendering = vi.hoisted(() => ({ updates: vi.fn(), dispose: vi.fn() }));
vi.mock('@app-game/paint-core/preview/client', () => ({
  attachStrokePreview: () => ({ update: rendering.updates, pause: vi.fn(), dispose: rendering.dispose })
}));

const disposers: (() => void)[] = [];
const observations = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        observations.set(element, this.callback);
      }
      unobserve(element: Element) {
        observations.delete(element);
      }
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.clearAllMocks();
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  flush();
  observations.clear();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['live', 'edit', 'preview'] satisfies PartMode[])(
  'renders every registered kind and look in %s mode',
  (mode) => {
    const { services, errors } = owned(createTestServices);
    services.presets.all = () => [builtInPresets[0]!];
    for (const definition of partDefinitions) {
      for (const look of definition.looks?.looks ?? [undefined]) {
        mount(() => (
          <LegoServicesContext value={services}>
            <PartFrame
              kind={definition.family === 'preset' ? `preset:${builtInPresets[0]!.id}` : definition.kind}
              look={look?.id}
              span={look?.min ?? { columns: 2, rows: 2 }}
              mode={mode}
            />
          </LegoServicesContext>
        ));
      }
    }

    intersectAll(true);
    expect(document.querySelector('[aria-label^="Broken part:"]')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-part-kind]')).toHaveLength(
      partDefinitions.reduce((count, definition) => count + (definition.looks?.looks.length ?? 1), 0)
    );
  }
);

it.each(['edit', 'preview'] satisfies PartMode[])(
  '%s bindings never run commands or write preferences, even with scripted events',
  (mode) => {
    const { services } = owned(createTestServices);
    const mutations = collectMocks(services);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const timers = vi.spyOn(globalThis, 'setTimeout');
    for (const definition of partDefinitions) {
      mount(() => (
        <LegoServicesContext value={services}>
          <PartFrame kind={definition.kind} span={{ columns: 5, rows: 5 }} mode={mode} />
        </LegoServicesContext>
      ));
    }

    intersectAll(true);
    for (const button of document.querySelectorAll('button')) {
      button.click();
    }
    for (const input of document.querySelectorAll('input')) {
      input.value = '#00ff00';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    flush();

    for (const command of mutations) {
      expect(command).not.toHaveBeenCalled();
    }
    expect(storage).not.toHaveBeenCalled();
    expect(timers).not.toHaveBeenCalled();
  }
);

it('continues observing a preview while offscreen and resumes its live colors on re-entry', () => {
  const { services, setBrush } = owned(createTestServices);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="color:pair" mode="preview" span={{ columns: 2, rows: 1 }} />
    </LegoServicesContext>
  ));
  expect(document.querySelector('[aria-label="Foreground color"]')).toBeNull();
  intersectAll(true);
  expect(document.querySelector('[aria-label="Foreground color"]')).not.toBeNull();
  intersectAll(false);
  expect(document.querySelector('[aria-label="Foreground color"]')).toBeNull();
  setBrush((brush) => ({ ...brush, color: '#0000ff' }));
  flush();
  intersectAll(true);
  expect((document.querySelector('[aria-label="Foreground color"]') as HTMLElement).style.background).toBe(
    'rgb(0, 0, 255)'
  );
});

it.each(['live', 'edit', 'preview'] satisfies PartMode[])('renders each definition popup in %s mode', (mode) => {
  const { services, errors } = owned(createTestServices);
  for (const definition of partDefinitions.filter((definition) => definition.hasPopup)) {
    mount(() => (
      <LegoServicesContext value={services}>
        <PartFrame kind={definition.kind} popup mode={mode} />
      </LegoServicesContext>
    ));
  }
  intersectAll(true);
  expect(document.querySelector('[aria-label^="Broken part:"]')).toBeNull();
  expect(errors).not.toHaveBeenCalled();
});

it('binds symmetry modes, QuickShape and pressure through their narrow commands', () => {
  const { services } = owned(createTestServices);
  const [mode, setMode] = owned(() => createSignal<ReturnType<typeof services.symmetry.mode>>('vertical'));
  services.symmetry.mode = owned(() => createMemo(mode));
  services.symmetry.setMode = vi.fn(setMode);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:symmetry" span={{ columns: 2, rows: 2 }} />
      <PartFrame kind="action:quickshape" />
      <PartFrame kind="action:pressure" />
    </LegoServicesContext>
  ));
  const symmetry = document.querySelector<HTMLButtonElement>('[aria-label="Symmetry"]')!;
  expect(symmetry.title).toBe('Symmetry: Vertical');
  expect(symmetry.getAttribute('aria-pressed')).toBe('true');
  symmetry.click();
  expect(services.symmetry.toggle).toHaveBeenCalledOnce();
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Paint symmetry mode"]')!;
  select.value = 'radial';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(services.symmetry.setMode).toHaveBeenCalledWith('radial');
  expect(symmetry.title).toBe('Symmetry: Radial');
  document.querySelector<HTMLButtonElement>('[aria-label="QuickShape"]')!.click();
  expect(services.quickShape.toggle).toHaveBeenCalledOnce();
  document.querySelector<HTMLButtonElement>('[aria-label="Pressure calibration"]')!.click();
  expect(services.windows.toggle).toHaveBeenCalledWith('pressure');
});

it('binds the controlled foreground/background pair to its narrow swap command', () => {
  const { services } = owned(createTestServices);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="color:pair" span={{ columns: 2, rows: 1 }} />
    </LegoServicesContext>
  ));
  document.querySelector<HTMLButtonElement>('[aria-label="Background color: swap with the foreground"]')!.click();
  expect(services.color.swap).toHaveBeenCalledOnce();
});

it('keeps shared Coolorus choices across a look change, lift-style remount and reload', () => {
  const { services } = owned(createTestServices);
  const [look, setLook] = createSignal('coolorus');
  const [mounted, setMounted] = createSignal(true);
  // Frame replacement models lifting between hosts; settings belong to neither frame nor look.
  mount(() => (
    <LegoServicesContext value={services}>
      <Show when={mounted()}>
        <PartFrame kind="color:wheel" look={look()} span={{ columns: 4, rows: 4 }} />
      </Show>
    </LegoServicesContext>
  ));
  const settings = document.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!;
  settings.click();
  flush();
  services.color.coolorus.update({ lockLightness: true });
  flush();
  expect(services.color.coolorus.settings()).toEqual({ hues: 'rgb', lockLightness: true });
  setLook('square');
  flush();
  setLook('coolorus');
  flush();
  expect(document.querySelector('[aria-label="Hue"]')).not.toBeNull();
  setMounted(false);
  flush();
  setMounted(true);
  flush();
  expect(document.querySelector('[aria-label="Hue"]')).not.toBeNull();
  const reloaded = owned(createTestServices);
  expect(reloaded.services.color.coolorus.settings()).toEqual({ hues: 'rgb', lockLightness: true });
});

it('unmounts and remounts the actual look chooser previews as they scroll out and in', () => {
  const { services } = owned(createTestServices);
  mount(() => (
    <LegoServicesContext value={services}>
      <LookChooser
        part={{ id: 'picker', kind: 'color:wheel', cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } }}
        onLook={vi.fn()}
      />
    </LegoServicesContext>
  ));
  const frames = [...document.querySelectorAll('[data-mode="preview"]')];
  expect(frames).toHaveLength(5);
  expect(frames.every((frame) => frame.childElementCount === 0)).toBe(true);
  intersectAll(true);
  expect(frames.every((frame) => frame.childElementCount > 0)).toBe(true);
  intersectAll(false);
  expect(frames.every((frame) => frame.childElementCount === 0)).toBe(true);
  intersectAll(true);
  expect(frames.every((frame) => frame.childElementCount > 0)).toBe(true);
});

it('keeps brush tile DOM identity when the library list gains a preset', () => {
  const { services } = owned(createTestServices);
  const initial = builtInPresets[0]!;
  const [presets, setPresets] = createSignal([initial]);
  services.presets.all = presets;
  const sheet = owned(() => createSheet(() => 768));
  const kits = owned(createKits);
  sheet.to('middle');
  flush();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        presets={presets}
        sheet={sheet}
        kits={kits}
        over={false}
        onLift={vi.fn()}
        onLiftKit={vi.fn()}
        onReset={vi.fn()}
        ref={vi.fn()}
        benchRef={vi.fn()}
        kitsRef={vi.fn()}
        overKits={false}
        flashKit={undefined}
      />
    </LegoServicesContext>
  ));
  const tile = document.querySelector(`[title="${initial.name}"]`);
  expect(tile).not.toBeNull();
  setPresets([initial, { ...initial, id: 'another', name: 'Another brush' }]);
  flush();
  expect(document.querySelector(`[title="${initial.name}"]`)).toBe(tile);
});

it('adds a channel using one spec, including fraction edits, number edits and exact cancellation', () => {
  const { services } = owned(createTestServices);
  const [flow, setFlow] = createSignal(25);
  const channel = {
    id: 'flow',
    label: 'Flow',
    short: 'Fl',
    unit: '%',
    min: 10,
    max: () => 110,
    read: () => flow(),
    write: (_services, next) => {
      setFlow(next);
    },
    colored: false,
    track: () => 'linear-gradient(black, white)'
  } satisfies ValueChannel;
  const definition = defineValuePart(channel);
  const frame: PartBinding = {
    kind: 'value:flow',
    span: { columns: 3, rows: 1 },
    look: 'slider',
    mode: 'live',
    command:
      (command) =>
      (...args) => {
        command(...args);
      },
    onPopup: vi.fn(),
    onOpen: vi.fn(),
    onDone: vi.fn()
  };
  const binding = definition.needs(services, frame);
  expect(definition.kind).toBe('value:flow');
  expect(binding.fraction).toBe(0.15);
  expect(binding.track).toBe('linear-gradient(black, white)');
  binding.onStart();
  binding.onInput(0.7);
  flush();
  expect(binding.number).toBe(80);
  binding.onCancel();
  flush();
  expect(binding.number).toBe(25);
  binding.onNumberCommit(42);
  flush();
  expect(binding.text).toBe('42%');
  expect(services.color.set).not.toHaveBeenCalled();
});

it('rejects an unknown channel with no writer instead of silently dropping writes', () => {
  const channel = {
    id: 'future',
    label: 'Future',
    short: 'F',
    unit: '',
    min: 0,
    max: () => 1,
    read: () => 0,
    colored: false
  };
  // Untyped registry extensions must fail loudly as well as being rejected by TypeScript.
  // @ts-expect-error A value spec cannot omit its write command.
  expect(() => defineValuePart(channel)).toThrow('Value channel future requires a write command');
});

it('gives FileMenu only the five file commands and closes it after each selection', () => {
  const { services } = owned(createTestServices);
  const done = vi.fn();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:file" popup onDone={done} />
    </LegoServicesContext>
  ));
  expect(Object.keys(services.files).sort()).toEqual(['download', 'import', 'place', 'png', 'psd', 'ready']);
  for (const [label, command] of [
    ['Save drawing', services.files.download],
    ['Export picture', services.files.png],
    ['Export layers', services.files.psd]
  ] as const) {
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent?.includes(label))!
      .click();
    expect(command).toHaveBeenCalledOnce();
  }
  const file = new File(['drawing'], 'drawing.paint');
  for (const [index, command] of [services.files.import, services.files.place].entries()) {
    const input = document.querySelectorAll('input')[index]!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(command).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  }
  expect(done).toHaveBeenCalledTimes(5);
});

it('keeps FileMenu commands and completion inert in preview mode', () => {
  const { services } = owned(createTestServices);
  const done = vi.fn();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:file" popup mode="preview" immediate onDone={done} />
    </LegoServicesContext>
  ));
  document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]').forEach((button) => button.click());
  expect(services.files.download).not.toHaveBeenCalled();
  expect(services.files.png).not.toHaveBeenCalled();
  expect(services.files.psd).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
});

it('mounts carried parts and kit blocks before any visibility callback, keeping them read-only', () => {
  const { services } = owned(createTestServices);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:undo" mode="preview" immediate />
      <BlockView
        immediate
        parts={[{ id: 'pair', kind: 'color:pair', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 1 } }]}
      />
    </LegoServicesContext>
  ));
  expect(document.querySelector('[aria-label="Foreground color"]')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.click();
  expect(services.history.undo).not.toHaveBeenCalled();
  expect(observations.size).toBe(0);
});

it('preserves the shared preview default background and saved-color precedence', async () => {
  mount(() => <StrokePreview settings={{ color: '#123456' }} color="#abcdef" height={80} />);
  intersectAll(true);
  await vi.waitFor(() =>
    expect(rendering.updates).toHaveBeenCalledWith(
      expect.objectContaining({
        background: '#333333',
        brush: expect.objectContaining({ color: '#123456' })
      })
    )
  );
});

it('samples LEGO presets in the current brush color on their normal and active tile backgrounds', async () => {
  const palette = document.createElement('style');
  palette.textContent = 'button { --lego-tile: #faf0e0; --lego-preset-active: #aabbff; }';
  document.body.append(palette);
  const { services, setBrush } = owned(createTestServices);
  const preset = { ...builtInPresets[0]!, settings: { ...builtInPresets[0]!.settings, color: '#123456' } };
  const [active, setActive] = createSignal('');
  services.presets.all = () => [preset];
  services.tools.preset = active;
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind={`preset:${preset.id}`} span={{ columns: 2, rows: 2 }} />
    </LegoServicesContext>
  ));
  intersectAll(true);
  await vi.waitFor(() =>
    expect(rendering.updates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        background: '#faf0e0',
        brush: expect.objectContaining({ color: '#ff0000' })
      })
    )
  );
  setActive(preset.id);
  setBrush((brush) => ({ ...brush, color: '#00ff00' }));
  flush();
  await vi.waitFor(() =>
    expect(rendering.updates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        background: '#aabbff',
        brush: expect.objectContaining({ color: '#00ff00' })
      })
    )
  );
});

/** Finds every fake capability, including nested commands added after this test was written. */
function collectMocks(value: unknown): MockInstance[] {
  if (vi.isMockFunction(value)) {
    return [value];
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectMocks);
  }

  return [];
}

function intersectAll(visible: boolean) {
  for (const [target, callback] of observations) {
    callback([{ target, isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
  flush();
}

function owned<T>(create: () => T) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
}

function mount(view: Parameters<typeof render>[0]) {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(view, host));
  flush();
}
