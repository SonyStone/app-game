// @vitest-environment jsdom
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { flush } from 'solid-js';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { featureDemos, paintVariants } from '.';
import type { EngineHandlers, EngineInit, ExecutionMode } from '../features/engine/openPaintTransport';

const transports = vi.hoisted(() => ({ opened: [] as FakeTransport[] }));
vi.mock('../features/engine/openPaintTransport', () => ({
  openPaintTransport: (mode: ExecutionMode, canvas: HTMLCanvasElement, init: EngineInit, handlers: EngineHandlers) => {
    const transport = { mode, canvas, init, handlers, post: vi.fn(() => ok()), close: vi.fn() };
    transports.opened.push(transport);
    return ok(transport);
  }
}));

type FakeTransport = {
  canvas: HTMLCanvasElement;
  init: EngineInit;
  handlers: EngineHandlers;
  post: ReturnType<typeof vi.fn>;
};

let dispose: (() => void) | undefined;
/** The pointer types of presses that reached the document, after the window's capture listeners. */
let reached: string[];
const record = (event: Event) => reached.push((event as PointerEvent).pointerType);

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
  globalThis.PointerEvent ??= class extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  } as unknown as typeof PointerEvent;
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

beforeEach(() => {
  reached = [];
  document.addEventListener('pointerdown', record, { capture: true });
});

// The first import of a variant's modules is slow under load: done once here, outside the tests' time limit.
beforeAll(async () => {
  await Promise.all([...paintVariants, ...featureDemos].map((variant) => variant.load()));
}, 60_000);

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.removeEventListener('pointerdown', record, { capture: true });
  transports.opened.length = 0;
  document.body.replaceChildren();
  localStorage.clear();
  history.replaceState(null, '', '/');
});

it.each([...paintVariants, ...featureDemos].map((variant) => [variant.name, variant] as const))(
  '%s gets palm rejection, pen hover, the move to a new tab and the storage lock from the session',
  async (_, variant) => {
    // Opened by a move: the engine waits longer for the old tab to hand the drawing over.
    history.replaceState(null, '', '/?paintMoved');
    const Variant = await variant.load();
    dispose = render(() => <Variant />, document.body);
    flush();
    await vi.waitFor(() => expect(transports.opened).toHaveLength(1));
    const transport = transports.opened[0]!;
    expect(transport.init.storageWaitMs).toBe(30_000);
    expect(location.search).toBe('');
    reply(transport, { type: 'ready' });

    // The pen hovers at x 500: with the default left hand, a touch at 300 is a palm, one at 700 the free hand's.
    pointer('pointermove', 'pen', 500);
    pointer('pointerdown', 'touch', 300, 2);
    pointer('pointerup', 'touch', 300, 2);
    pointer('pointerdown', 'touch', 700, 3);
    pointer('pointerup', 'touch', 700, 3);
    expect(reached).toEqual(['touch']);

    // The pen touches down after hovering, then twice more without hover: Chrome lost it in this tab.
    expect(document.querySelector('[aria-label="Pen hover lost"]')).toBeNull();
    for (let contact = 0; contact < 3; contact++) {
      pointer('pointerdown', 'pen', 500);
      pointer('pointerup', 'pen', 500);
    }

    expect(document.querySelector('[aria-label="Pen hover lost"]')?.textContent).toContain('Fix pen');

    reply(transport, { type: 'storage-lock', state: 'lost' });
    expect(document.body.textContent).toContain('This drawing was opened in another tab');
  }
);

it.each([...paintVariants, ...featureDemos].map((variant) => [variant.name, variant] as const))(
  '%s shows the session windows over its UI',
  async (_, variant) => {
    // Windows opened in another variant stay open.
    localStorage.setItem('paint.windows', JSON.stringify({ palette: { open: true }, pen: { open: true } }));
    const Variant = await variant.load();
    dispose = render(() => <Variant />, document.body);
    flush();

    const palette = document.querySelector('[role="dialog"][aria-label="Mixing palette"]');
    expect(palette?.querySelector('canvas[aria-label="Mixing palette"]')).toBeTruthy();
    const pen = document.querySelector('[role="dialog"][aria-label="Pen"]');
    expect(pen?.textContent).toContain('Palm rejection');
    expect(pen?.textContent).toContain('continue in a new tab automatically');

    // The Pen window leads to the pen pressure calibration, a window of its own.
    expect(pen?.textContent).toContain('Not calibrated');
    [...pen!.querySelectorAll('button')].find((button) => button.textContent === 'Calibrate…')!.click();
    flush();
    expect(document.querySelector('[role="dialog"][aria-label="Pen pressure"]')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('paint.windows')!)).toMatchObject({ pressure: { open: true } });
    document.querySelector<HTMLButtonElement>('button[aria-label="Close Pen pressure"]')!.click();
    flush();
    expect(document.querySelector('[role="dialog"][aria-label="Pen pressure"]')).toBeNull();

    pen!.querySelector<HTMLButtonElement>('button[aria-label="Close Pen"]')!.click();
    flush();
    expect(document.querySelector('[role="dialog"][aria-label="Pen"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('paint.windows')!)).toMatchObject({ pen: { open: false } });
  }
);

it.each(
  [...paintVariants, ...featureDemos.filter((demo) => demo.id === 'demo-symmetry')].map(
    (variant) => [variant.name, variant] as const
  )
)(
  '%s turns a stroke held at its end into a shape',
  async (_, variant) => {
    const Variant = await variant.load();
    dispose = render(() => <Variant />, document.body);
    flush();
    await vi.waitFor(() => expect(transports.opened).toHaveLength(1));
    const transport = transports.opened[0]!;
    reply(transport, { type: 'ready' });
    // Ready once the presets are restored, which sends the view.
    await vi.waitFor(() => expect(transport.post).toHaveBeenCalled());
    flush();
    const canvas = transport.canvas;
    canvas.setPointerCapture = () => {};
    canvas.hasPointerCapture = () => true;

    vi.useFakeTimers();
    try {
      // jsdom stamps events of the same millisecond alike; input samples have increasing times.
      let time = 0;
      const at = (type: string, x: number, y: number) => {
        const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 });
        for (const [key, value] of Object.entries({ pointerType: 'mouse', pointerId: 1, timeStamp: ++time })) {
          Object.defineProperty(event, key, { value });
        }

        canvas.dispatchEvent(event);
        flush();
      };
      at('pointerdown', 100, 100);
      for (let x = 120; x <= 400; x += 20) {
        at('pointermove', x, 100);
      }

      vi.advanceTimersByTime(500);
      flush();
      const sent = transport.post.mock.calls.map(([command]) => (command as { type: string }).type);
      expect(sent).toContain('begin');
      expect(sent).toContain('replace-stroke');
      expect(document.querySelector('[role="status"] strong')?.textContent).toBe('Line');
    } finally {
      vi.useRealTimers();
    }
  }
);

// Puck's cluster, which holds its tools, does not open under jsdom; its opener is checked in a browser.
it.each(paintVariants.filter(({ id }) => id !== 'puck').map((variant) => [variant.name, variant] as const))(
  '%s offers the local undo, with its settings, Apply and Cancel',
  async (_, variant) => {
    const Variant = await variant.load();
    dispose = render(() => <Variant />, document.body);
    flush();
    await vi.waitFor(() => expect(transports.opened).toHaveLength(1));
    reply(transports.opened[0]!, { type: 'ready' });

    await localUndoOpeners[variant.id]!();
    flush();
    // Classic shows the settings in its tool panel, the other variants in the session's Local undo window.
    if (variant.id === 'studio') {
      click('button[aria-label="Brush settings"]');
    }

    const settings = document.querySelector('[role="group"][aria-label="Mark the area with"]')?.parentElement;
    expect(settings?.textContent).toContain('Steps back');
    expect(settings?.querySelector('button[title="Apply · Enter"]')).toBeTruthy();
    expect(Boolean(document.querySelector('[role="dialog"][aria-label="Local undo"]'))).toBe(variant.id !== 'studio');
  }
);

/** How each variant opens the local undo: its own button, menu row or command. */
const localUndoOpeners: Record<string, () => void | Promise<void>> = {
  studio: () => click('nav[aria-label="Drawing tools"] button[aria-label="Local undo"]'),
  procreate: () => click('button[aria-label="Local undo"]'),
  infinite() {
    click('button[aria-label="Editing Tools"]');
    const entry = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Editing Tools"] button')].find(
      (button) => button.textContent === 'Local undo'
    );
    entry!.click();
    flush();
  },
  desktop: () => click('nav[aria-label="Tools"] button[aria-label="Local undo"]'),
  lego: () => click('button[aria-label="Local undo"]'),
  zen() {
    const pebble = document.querySelector<HTMLElement>('[aria-label^="Tools · drag to move"]')!;
    for (const type of ['pointerdown', 'pointerup']) {
      pebble.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }), {
          pointerType: 'mouse',
          pointerId: 7
        })
      );
    }

    flush();
    click('button[aria-label="Layers and export"]');
    const row = [...document.querySelectorAll<HTMLButtonElement>('button[role="switch"]')].find((button) =>
      button.textContent?.startsWith('Local undo')
    );
    row!.click();
  },
  async command() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
    flush();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Command"]')!;
    input.value = 'local undo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Local undo"]')).toBeTruthy());
  }
};

/** Clicks the element matching `selector`, which must exist, and flushes. */
function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element, selector).toBeTruthy();
  element!.click();
  flush();
}

function reply(transport: FakeTransport, event: PaintEvent) {
  transport.handlers.message(event);
  flush();
}

/** Dispatches a pointer event on the body, as the window's listeners see one anywhere in the page. */
function pointer(type: string, pointerType: string, clientX: number, pointerId = 1) {
  const buttons = type === 'pointerdown' ? 1 : 0;
  document.body.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100, buttons }), {
      pointerType,
      pointerId
    })
  );
  flush();
}
