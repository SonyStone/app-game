// @vitest-environment jsdom
import { render } from '@solidjs/web';
import 'fake-indexeddb/auto';
import { ok } from 'neverthrow';
import { createEffect, flush, untrack } from 'solid-js';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { hexToWheel } from '../../features/color-wheel';
import type { EngineHandlers } from '../../features/engine/openPaintTransport';
import type { PaintSession } from '../../features/session';
import type { LegoServices } from './LegoServices';
import { LegoStudio } from './LegoStudio';

const wiring = vi.hoisted(() => ({
  session: undefined as PaintSession | undefined,
  services: undefined as LegoServices | undefined,
  handlers: undefined as EngineHandlers | undefined,
  partMounts: 0,
  colorReads: 0,
  recentInstances: 0,
  sampleUpdates: vi.fn()
}));

// Keep the real session and its signal setters; only replace the GPU transport unavailable in jsdom.
vi.mock('../../features/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/session')>();
  return {
    ...actual,
    createPaintSession: (...args: Parameters<typeof actual.createPaintSession>) => {
      wiring.session = actual.createPaintSession(...args);
      return wiring.session;
    }
  };
});
vi.mock('./LegoServices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./LegoServices')>();
  return {
    ...actual,
    createLegoServices: (...args: Parameters<typeof actual.createLegoServices>) => {
      wiring.services = actual.createLegoServices(...args);
      return wiring.services;
    }
  };
});
vi.mock('./colorParts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./colorParts')>();
  return {
    ...actual,
    PairPart: (props: Parameters<typeof actual.PairPart>[0]) => {
      wiring.partMounts += 1;
      createEffect(
        () => props.colors,
        () => {
          wiring.colorReads += 1;
        }
      );
      return actual.PairPart(props);
    }
  };
});
vi.mock('../../features/color/createRecentColors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/color/createRecentColors')>();
  return {
    createRecentColors: () => {
      wiring.recentInstances += 1;
      return actual.createRecentColors();
    }
  };
});
vi.mock('@app-game/paint-core/preview/client', () => ({
  attachStrokePreview: () => ({ update: wiring.sampleUpdates, pause: vi.fn(), dispose: vi.fn() })
}));
vi.mock('../../features/engine/openPaintTransport', () => ({
  openPaintTransport: (_mode: unknown, _canvas: unknown, _init: unknown, handlers: EngineHandlers) => {
    wiring.handlers = handlers;
    return ok({
      post: vi.fn((command) => {
        if (command.type === 'dispose') {
          queueMicrotask(() => handlers.message({ type: 'disposed' }));
        }

        return ok();
      }),
      close: vi.fn()
    });
  }
}));

let dispose: (() => void) | undefined;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= (query: string) =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {}
    }) satisfies MediaQueryList;
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(768);
  wiring.partMounts = 0;
  wiring.colorReads = 0;
  wiring.recentInstances = 0;
  wiring.sampleUpdates.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        untrack(() =>
          this.callback(
            [{ target, isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
        );
      }
      unobserve() {}
      disconnect() {}
    }
  );
  localStorage.setItem('paint.lego', JSON.stringify({ version: 2, board: { panels: [] } }));
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  flush();
  wiring.session = undefined;
  wiring.services = undefined;
  wiring.handlers = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { key: 'paint.lego', payload: { version: 3, board: { panels: [] } }, label: 'Board' },
  { key: 'paint.lego', payload: { version: 3 }, label: 'Board' },
  { key: 'paint.lego.kits', payload: { version: 3, kits: [] }, label: 'Kit' },
  { key: 'paint.lego.kits', payload: { version: 3 }, label: 'Kit' }
])('shows the real session notice for future $key data and keeps Edit reactive', ({ key, payload, label }) => {
  const raw = JSON.stringify(payload);
  localStorage.setItem(key, raw);
  mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(`${label} changes can't be saved`);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('newer Paint version');
  expect(wiring.session!.error()).toMatchObject({ kind: 'lego', code: 'storage' });
  click('Edit');
  expect(button('Done')).toBeDefined();
  click('Dismiss');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  click('Done');
  expect(button('Edit')).toBeDefined();
  expect(localStorage.getItem(key)).toBe(raw);
});

it('keeps the app reactive with both future board and kit data', () => {
  localStorage.setItem('paint.lego', '{"version":3}');
  localStorage.setItem('paint.lego.kits', '{"version":3}');
  mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('newer Paint version');
  click('Edit');
  expect(button('Done')).toBeDefined();
});

it('shows a notice and keeps Edit reactive when a corrupt board cannot be backed up', () => {
  localStorage.setItem('paint.lego', '{broken');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Board changes can't be saved");
  click('Edit');
  expect(button('Done')).toBeDefined();
  expect(localStorage.getItem('paint.lego')).toBe('{broken');
});

it.each([
  { kind: 'canvas', saving: 'read-only' },
  { kind: 'engine', saving: 'read-only' },
  { kind: 'canvas', saving: 'failed' },
  { kind: 'engine', saving: 'failed' }
])('keeps an existing $kind failure and its recovery action when saving is $saving', ({ kind, saving }) => {
  if (saving === 'read-only') {
    localStorage.setItem('paint.lego', JSON.stringify({ version: 3, board: { panels: [] } }));
  }

  mount();

  if (saving === 'read-only') {
    click('Dismiss');
  } else {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
  }

  if (kind === 'canvas') {
    wiring.handlers!.message({ type: 'error', recoverable: true, code: 'render', message: 'Canvas failed' });
  } else {
    wiring.handlers!.error({ kind: 'error', cause: new ErrorEvent('error', { message: 'Engine stopped' }) });
  }

  flush();
  const failure = wiring.session!.error();
  const action = kind === 'canvas' ? 'Restore renderer' : 'Restart engine';
  const title = kind === 'canvas' ? 'Canvas paused' : 'Drawing engine stopped';
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(title);
  expect(button(action)).toBeDefined();
  click('Edit');
  openBox();
  click('Reset board');
  expect(wiring.session!.error()).toBe(failure);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(title);
  expect(button(action)).toBeDefined();
  click('Dismiss');
  click('Reset board');
  expect(wiring.session!.error()).toMatchObject({ kind: 'lego', code: 'storage' });
});

it('mounts no box content while closed, including after opening and closing it', () => {
  mount();
  click('Edit');
  expect(document.querySelector('[class*="trayContent"]')).toBeNull();
  expect(document.querySelector('[class*="kitPreview"]')).toBeNull();
  openBox();
  expect(button('Reset board')).toBeDefined();
  openBox();
  expect(document.querySelector('[class*="trayContent"]')).toBeNull();
  expect(button('Reset board')).toBeUndefined();
});

it('keeps a board part mounted through an edit tap', () => {
  storeParts(['color:pair']);
  mount();
  click('Edit');
  const mounted = wiring.partMounts;
  const part = document.querySelector<HTMLElement>('[data-part="test-0"]')!;
  part.getBoundingClientRect = () => new DOMRect(12, 12, 92, 44);
  pointer(part, 'pointerdown', 25, 25);
  pointer(window, 'pointerup', 25, 25);
  expect(wiring.partMounts).toBe(mounted);
  expect(document.querySelector('[data-part="test-0"]')).toBe(part);
});

it('a size change neither reruns color-only parts nor repaints preset samples', async () => {
  storeParts(['color:pair', 'preset:builtin:soft-round']);
  mount();
  // The fake transport is not ready, so resource restoration cannot replace the brush during the count.
  await vi.waitFor(() => expect(wiring.sampleUpdates).toHaveBeenCalled());
  const reads = wiring.colorReads;
  const paints = wiring.sampleUpdates.mock.calls.length;
  wiring.session!.tools.updateBrush({ size: 137 });
  flush();
  await Promise.resolve();
  expect(wiring.colorReads).toBe(reads);
  expect(wiring.sampleUpdates).toHaveBeenCalledTimes(paints);
  wiring.session!.tools.updateBrush({ color: '#abcdef' });
  flush();
  await vi.waitFor(() => expect(wiring.sampleUpdates.mock.calls.length).toBeGreaterThan(paints));
  expect(wiring.colorReads).toBeGreaterThan(reads);
});

it('LEGO and the mixing window share one session-owned recent-color list', () => {
  storeParts(['color:hex', 'color:history']);
  mount();
  wiring.session!.windows.open('palette');
  flush();
  expect(wiring.recentInstances).toBe(1);
  const hex = document.querySelector<HTMLInputElement>('[aria-label="Hex color"]')!;
  hex.value = '#123456';
  hex.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(wiring.session!.recentColors.colors()).toEqual(['#123456']);
  expect(document.querySelector('[aria-label="Load #123456"]')).not.toBeNull();
  wiring.session!.recentColors.remember('#abcdef');
  flush();
  document.querySelector<HTMLButtonElement>('[aria-label="Load #123456"]')!.click();
  flush();
  expect(wiring.session!.recentColors.colors()).toEqual(['#123456', '#abcdef']);
  expect(document.querySelector('[aria-label="Color history"] [title="#abcdef"]')).not.toBeNull();
  expect(wiring.recentInstances).toBe(1);
});

it('uses the session wheel settings and preserves OKLCH intent through black without read-time mutation', () => {
  mount();
  const { color } = wiring.services!;
  expect(color.oklch.settings).toBe(wiring.session!.colorWheel.settings);
  expect(color.recent).toBe(wiring.session!.recentColors);
  expect(color.coolorus).toBe(wiring.session!.coolorus);
  const red = hexToWheel('#e0703a');
  color.oklch.edit({ ...red, l: 0 });
  flush();
  const black = color.oklch.wheel();
  expect(color.oklch.wheel()).toBe(black);
  expect(black).toEqual({ ...red, l: 0 });
  wiring.session!.tools.updateBrush({ size: 137 });
  flush();
  expect(color.oklch.wheel()).toBe(black);
  color.oklch.edit({ ...black, l: red.l });
  flush();
  expect(color.value()).toBe('#e0703a');
});

it('session color commands keep picker and mixing-palette policies distinct', () => {
  mount();
  const session = wiring.session!;
  session.chooseTool('lasso');
  flush();
  session.setColor('#abcdef');
  flush();
  expect(session.tool()).toBe('lasso');
  session.loadColor('#123456');
  flush();
  expect(session.tool()).toBe('brush');
  session.chooseTool('eraser');
  flush();
  session.setColor('#654321');
  flush();
  expect(session.tool()).toBe('brush');
});

/** Writes a small, known board without using the live session or the app's stored drawing. */
function storeParts(kinds: string[]) {
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({
      version: 2,
      board: {
        panels: [
          {
            id: 'test-panel',
            at: { x: 12, y: 12 },
            parts: kinds.map((kind, index) => ({
              id: `test-${index}`,
              kind,
              cell: { column: index * 2, row: 0 },
              span: { columns: 2, rows: 1 }
            }))
          }
        ]
      }
    })
  );
}

function pointer(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'pen' } });
  target.dispatchEvent(event);
  flush();
}

/** Mounts the actual variant, including its storage callbacks, session and notices. */
function mount() {
  dispose = render(() => <LegoStudio />, document.body);
  flush();
}

function button(text: string) {
  return [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === text);
}

function click(text: string) {
  const element = button(text);
  expect(element).toBeDefined();
  element!.click();
  flush();
}

/** Opens the sheet through its real tap gesture. */
function openBox() {
  const handle = document.querySelector<HTMLElement>('[aria-label="Box of parts"] > div')!;
  handle.setPointerCapture = vi.fn();
  handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  flush();
}
