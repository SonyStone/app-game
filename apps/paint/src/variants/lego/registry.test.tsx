// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { createSheet } from './createSheet';
import { createKits } from './kits';
import { LegoServicesContext } from './LegoServices';
import { LookChooser } from './LookChooser';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import type { PartMode } from './parts/definition';
import { PartsTray } from './PartsTray';
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
    const mutations = [
      services.color.set,
      services.color.swap,
      services.brush.update,
      services.tools.toggle,
      services.history.undo,
      services.history.redo,
      services.windows.toggle,
      services.presets.choose,
      services.presets.use,
      services.transform.toggle,
      services.layers.action,
      services.layers.blending,
      services.files.edit,
      services.files.place
    ];
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

it('pauses and resumes the actual look chooser previews as they scroll out and in', () => {
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
