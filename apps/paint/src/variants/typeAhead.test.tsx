// @vitest-environment jsdom
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { flush } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { paintVariants } from '.';
import type { EngineHandlers, EngineInit } from '../features/engine/openPaintTransport';

const transports = vi.hoisted(() => ({ opened: [] as FakeTransport[] }));
vi.mock('../features/engine/openPaintTransport', () => ({
  openPaintTransport: (_mode: unknown, _canvas: unknown, init: EngineInit, handlers: EngineHandlers) => {
    const transport = { init, handlers, post: vi.fn(() => ok()), close: vi.fn() };
    transports.opened.push(transport);
    return ok(transport);
  }
}));

type FakeTransport = { init: EngineInit; handlers: EngineHandlers; post: ReturnType<typeof vi.fn> };

let dispose: (() => void) | undefined;

beforeAll(() => {
  // jsdom lacks what the variants' layouts measure with and what palm rejection constructs.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    }) as unknown as MediaQueryList;
});

// The first import of a variant's modules is slow under load: done once here, outside the tests' time limit.
beforeAll(async () => {
  await Promise.all(paintVariants.map((variant) => variant.load()));
}, 60_000);

afterEach(() => {
  dispose?.();
  dispose = undefined;
  transports.opened.length = 0;
  document.body.replaceChildren();
  localStorage.clear();
});

describe.each(['command', 'desktop'])('the %s variant’s type-ahead', (id) => {
  it('offers what goes with a shortcut key, and Escape takes back what the key did', async () => {
    await mount(id);

    press('e', 'KeyE');
    expect(strip()?.textContent).toContain('Eraser');
    expect(strip()?.textContent).toContain('Bigger');

    press('Escape', 'Escape');
    expect(strip()).toBeNull();

    // The size keys show the tool in use: the brush again.
    press(']', 'BracketRight');
    expect(strip()?.querySelector('header')?.textContent).toMatch(/^\]Brush/);
  });

  it('types a size after a brush key', async () => {
    await mount(id);

    press('b', 'KeyB');
    press('1', 'Digit1');
    const line = await focusedLine();
    expect(line.value).toBe('1');
    type(line, '12');
    expect(strip()?.textContent).toContain('Brush 12 px');

    keyOn(line, 'Enter');
    await vi.waitFor(() => expect(strip()?.getAttribute('data-mode')).toBe('done'));
    expect(strip()?.textContent).toBe('Brush 12 px');

    press(']', 'BracketRight');
    expect(strip()?.textContent).toContain('15 px');
  });

  it('types a command after a letter that is no shortcut', async () => {
    const transport = await mount(id);

    press('n', 'KeyN');
    const line = await focusedLine();
    type(line, 'new layer');
    keyOn(line, 'Enter');

    await vi.waitFor(() => expect(strip()?.textContent).toBe('New layer'));
    expect(transport.post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'layer', action: { type: 'add' } }),
      ...[]
    );
  });

  it('spells a word starting with a shortcut letter, taking back what the letter did', async () => {
    await mount(id);

    press('e', 'KeyE');
    press('p', 'KeyP');
    const line = await focusedLine();
    expect(line.value).toBe('ep');

    keyOn(line, 'Escape');
    press(']', 'BracketRight');
    expect(strip()?.querySelector('header')?.textContent).toMatch(/^\]Brush/);
  });
});

it('opens the command line from Desktop’s Find a command shortcut', async () => {
  await mount('desktop');

  // jsdom is no Apple device: Mod is Ctrl.
  press('k', 'KeyK', { ctrlKey: true });
  const line = await focusedLine();
  expect(line.value).toBe('');
});

/** Mounts the variant with id `id` on a fake engine that is ready. */
async function mount(id: string) {
  const Variant = await paintVariants.find((variant) => variant.id === id)!.load();
  dispose = render(() => <Variant />, document.body);
  flush();
  await vi.waitFor(() => expect(transports.opened).toHaveLength(1));
  const transport = transports.opened[0]!;
  transport.handlers.message({ type: 'ready' } as PaintEvent);
  flush();
  return transport;
}

function strip() {
  return document.querySelector<HTMLElement>('[data-type-ahead]');
}

/** Presses a key with the page focused, as on the canvas. */
function press(key: string, code: string, modifiers: KeyboardEventInit = {}) {
  keyOn(document.body, key, code, modifiers);
}

function keyOn(target: Element, key: string, code = key, modifiers: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...modifiers }));
  flush();
}

/** The command line, once it has taken the focus. */
async function focusedLine() {
  await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Command'));
  return document.activeElement as HTMLInputElement;
}

/** Replaces the command line's text, as typing does. */
function type(line: HTMLInputElement, text: string) {
  line.value = text;
  line.dispatchEvent(new InputEvent('input', { bubbles: true }));
  flush();
}
