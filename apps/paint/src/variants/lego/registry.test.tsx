// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import type { PartMode } from './parts/definition';
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
