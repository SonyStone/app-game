// @vitest-environment jsdom
import { render } from '@solidjs/web';
import 'fake-indexeddb/auto';
import { ok } from 'neverthrow';
import { flush } from 'solid-js';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { EngineHandlers } from '../../features/engine/openPaintTransport';
import type { PaintSession } from '../../features/session';
import { LegoStudio } from './LegoStudio';

const wiring = vi.hoisted(() => ({
  session: undefined as PaintSession | undefined,
  handlers: undefined as EngineHandlers | undefined
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
  localStorage.setItem('paint.lego', JSON.stringify({ version: 2, board: { panels: [] } }));
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  flush();
  wiring.session = undefined;
  wiring.handlers = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
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
  click('Reset board');
  expect(wiring.session!.error()).toBe(failure);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(title);
  expect(button(action)).toBeDefined();
  click('Dismiss');
  click('Reset board');
  expect(wiring.session!.error()).toMatchObject({ kind: 'lego', code: 'storage' });
});

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
