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

type FakeTransport = { init: EngineInit; handlers: EngineHandlers };

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
    expect(document.body.textContent).not.toContain('Chrome stopped seeing the pen');
    for (let contact = 0; contact < 3; contact++) {
      pointer('pointerdown', 'pen', 500);
      pointer('pointerup', 'pen', 500);
    }

    expect(document.body.textContent).toContain('Chrome stopped seeing the pen above the screen.');

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
