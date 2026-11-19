// @vitest-environment jsdom
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { defaultPaintSymmetry } from '@app-game/paint-core/symmetry';
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
import { boxSections, partDefinition } from './parts';

const wiring = vi.hoisted(() => ({
  session: undefined as PaintSession | undefined,
  services: undefined as LegoServices | undefined,
  handlers: undefined as EngineHandlers | undefined,
  panel: undefined as (() => string | undefined) | undefined,
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
      wiring.panel = args[0]?.panel;
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
  { key: 'paint.lego', payload: { version: 6, board: { panels: [] } }, label: 'Board' },
  { key: 'paint.lego', payload: { version: 6 }, label: 'Board' },
  { key: 'paint.lego.kits', payload: { version: 6, kits: [] }, label: 'Kit' },
  { key: 'paint.lego.kits', payload: { version: 6 }, label: 'Kit' }
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
  localStorage.setItem('paint.lego', '{"version":6}');
  localStorage.setItem('paint.lego.kits', '{"version":6}');
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
    localStorage.setItem('paint.lego', JSON.stringify({ version: 6, board: { panels: [] } }));
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

it('disables symmetry until the restored document accepts commands, including after a renderer failure', async () => {
  storeParts(['action:symmetry', 'action:symmetry']);
  const saved = JSON.parse(localStorage.getItem('paint.lego')!);
  saved.board.panels[0].parts[1].span = { columns: 2, rows: 2 };
  localStorage.setItem('paint.lego', JSON.stringify(saved));
  mount();
  const session = wiring.session!;
  const chooser = document.querySelector<HTMLSelectElement>('[aria-label="Paint symmetry mode"]')!;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Symmetry"]')];

  // The worker reports document state before ready; restored layers alone cannot authorize edits.
  wiring.handlers!.message({
    type: 'state',
    document: createDocument().state(),
    camera: defaultCamera(),
    features: { symmetry: { ...defaultPaintSymmetry(), mode: 'mandala' } },
    saved: true,
    saveState: 'saved',
    gpuBytes: 0,
    residentTiles: 0,
    renderMs: 0
  });
  flush();
  expect(session.engine.state().layers).toHaveLength(1);
  expect(session.canUpdateSymmetry()).toBe(false);
  expect(chooser.value).toBe('mandala');
  expect(chooser.disabled).toBe(true);

  for (const button of buttons) {
    expect(button.disabled).toBe(true);
    button.click();
  }

  flush();
  expect(session.symmetry.symmetry().mode).toBe('mandala');
  wiring.handlers!.message({ type: 'ready' });
  flush();
  expect(chooser.disabled).toBe(true);
  await vi.waitFor(() => {
    flush();
    expect(chooser.disabled).toBe(false);
  });
  chooser.value = 'off';
  chooser.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(session.symmetry.symmetry().mode).toBe('off');

  for (const button of buttons) {
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  }

  buttons[0]!.click();
  flush();
  expect(chooser.value).toBe('vertical');
  wiring.handlers!.message({ type: 'error', recoverable: true, message: 'Renderer stopped' });
  flush();
  expect(chooser.disabled).toBe(true);

  for (const button of buttons) {
    expect(button.disabled).toBe(true);
  }
});

it.each(['file', 'brushes'])('records the actual %s part popup name', (name) => {
  storeParts([`action:${name}`]);
  mount();
  expect(wiring.panel?.()).toBeUndefined();
  document.querySelector<HTMLButtonElement>(`[data-part-kind="action:${name}"] button`)!.click();
  flush();
  expect(wiring.panel?.()).toBe(`action:${name}`);
  button('Edit')!.click();
  flush();
  expect(wiring.panel?.()).toBeUndefined();
});

it('records a value popup using its part kind', () => {
  storeParts(['value:size']);
  const saved = JSON.parse(localStorage.getItem('paint.lego')!);
  saved.board.panels[0].parts[0].span = { columns: 1, rows: 1 };
  localStorage.setItem('paint.lego', JSON.stringify(saved));
  mount();
  const knob = document.querySelector('[data-part-kind="value:size"] [role="slider"]')!;
  pointer(knob, 'pointerdown', 0, 0);
  pointer(knob, 'pointerup', 0, 0);
  expect(wiring.panel?.()).toBe('value:size');
});

it("shows the brush's stroke preview above the studio's categories", () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();

  // The preview is the caller's: the dialog once lost it while its other pages were rearranged.
  expect(dialog.querySelector('[class*="studioPreview"]')!.childElementCount).toBeGreaterThan(0);
});

it('a studio row and the board part of one setting are the same control and show one value', () => {
  storeParts(['action:brush-editor', 'value:brush:flow']);
  const saved = JSON.parse(localStorage.getItem('paint.lego')!);
  saved.board.panels[0].parts[1].span = { columns: 4, rows: 1 };
  localStorage.setItem('paint.lego', JSON.stringify(saved));
  mount();
  const dialog = openStudio();
  const board = document.querySelector('[data-panel="test-panel"]')!;
  const slider = (root: Element) =>
    root.querySelector<HTMLElement>('[data-part-kind="value:brush:flow"] [role="slider"]')!;
  const shown = () => [board, dialog].map((root) => slider(root).getAttribute('aria-valuenow'));
  // The studio row is the part itself: the same slider, with the board part's label and value chips.
  expect(slider(dialog).className).toBe(slider(board).className);
  expect(slider(dialog).textContent).toBe(slider(board).textContent);

  pointer(slider(dialog), 'pointerdown', 0.2, 0);
  pointer(slider(dialog), 'pointerup', 0.2, 0);
  expect(wiring.session!.brush().flow).toBeCloseTo(0.21, 2);
  expect(shown()).toEqual(['20', '20']);
  expect(slider(board).textContent).toContain('21%');
  expect(slider(dialog).textContent).toBe(slider(board).textContent);

  pointer(slider(board), 'pointerdown', 0.6, 0);
  pointer(slider(board), 'pointerup', 0.6, 0);
  expect(shown()).toEqual(['60', '60']);
  expect(slider(dialog).textContent).toBe(slider(board).textContent);
  // One input: no number field beside the slider; the slider's value chip opens number entry.
  expect(dialog.querySelector('[data-part-kind="value:brush:flow"] input')).toBeNull();
  expect(slider(dialog).querySelector('[data-value-chip]')).not.toBeNull();
});

it("lifts a part of the setting by its studio row's grip onto the board, out of the studio's way, without Edit", () => {
  storeParts(['action:brush-editor']);
  // A full-screen layout, so the board maps the drop to a place on it.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1024, 768));
  mount();
  const dialog = openStudio();
  const grip = dialog.querySelector<HTMLElement>('[aria-label="Drag Flow onto the board"]')!;
  expect(document.querySelector('[data-panel] [data-part-kind="value:brush:flow"]')).toBeNull();

  pointer(grip, 'pointerdown', 20, 200);
  expect(dialog.hasAttribute('data-away')).toBe(false);
  pointer(grip, 'pointermove', 300, 400);
  expect(dialog.hasAttribute('data-away')).toBe(true);
  pointer(grip, 'pointermove', 420, 420);
  pointer(grip, 'pointerup', 420, 420);

  expect(dialog.hasAttribute('data-away')).toBe(false);
  const landed = document.querySelector<HTMLElement>('[data-panel] [data-part-kind="value:brush:flow"]')!;
  expect(landed).not.toBeNull();
  expect(landed.closest<HTMLElement>('[data-part]')!.style.width).toBe('188px');
  expect(landed.closest<HTMLElement>('[data-part]')!.style.height).toBe('44px');
  expect(button('Edit')).toBeDefined();
  expect(dialog.querySelector('[aria-label="Drag Flow onto the board (on the board)"]')).not.toBeNull();
  expect(dialog.querySelector('[aria-label="Drag Opacity onto the board"]')).not.toBeNull();
});

it('the slider of a studio row moves the value but never lifts a part', () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();
  const slider = dialog.querySelector<HTMLElement>('[data-part-kind="value:brush:flow"] [role="slider"]')!;
  pointer(slider, 'pointerdown', 0.5, 0);
  pointer(slider, 'pointermove', 0.9, 300);
  expect(dialog.hasAttribute('data-away')).toBe(false);
  pointer(slider, 'pointerup', 0.9, 300);
  expect(wiring.session!.brush().flow).toBeCloseTo(0.9, 1);
  expect(document.querySelector('[data-panel] [data-part-kind="value:brush:flow"]')).toBeNull();
});

it('shows missing-part placeholders for retired brush pressure settings on saved boards', () => {
  const kinds = ['minimum', 'maximum', 'firmness'].map((field) => `value:brush:pressure-${field}`);
  storeParts(kinds);
  mount();
  for (const kind of kinds) {
    expect(document.querySelector(`[aria-label="Missing part: ${kind}"]`)).not.toBeNull();
  }
});

it("edits the pen's curve in the studio's Pen page and on the board as one, and Cancel restores it", () => {
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({
      version: 2,
      board: {
        panels: [
          {
            id: 'test-panel',
            at: { x: 12, y: 12 },
            parts: [
              {
                id: 'settings',
                kind: 'action:brush-editor',
                cell: { column: 0, row: 0 },
                span: { columns: 2, rows: 1 }
              },
              // Stored before the brush's three-handle curve became the pen's: it loads as the pen's curve.
              {
                id: 'curve',
                kind: 'value:brush:pressure-curve',
                cell: { column: 0, row: 1 },
                span: { columns: 4, rows: 4 }
              }
            ]
          }
        ]
      }
    })
  );
  mount();
  const calibration = wiring.session!.pressureCalibration;
  expect(calibration.calibration()).toBeUndefined();
  const dialog = openStudio();
  const entry = penEntry(dialog);
  expect(entry.textContent).toContain('Off');
  entry.click();
  flush();
  const studio = () => dialog.querySelector('[data-pen-pane] svg[aria-label="Pressure curve"]')!;
  const board = () =>
    [...document.querySelectorAll('[data-panel] svg[aria-label="Pressure curve"]')].find(
      (element) => !dialog.contains(element)
    )!;
  const points = (graph: Element) => graph.querySelectorAll('[data-point]').length;
  expect(dialog.querySelector('[data-pen-pane] h2')!.textContent).toBe('Pen pressure');
  expect([points(studio()), points(board())]).toEqual([2, 2]);

  // A key in the studio moves the pen's last point, and the board's graph shows it.
  studio()
    .querySelector('[data-point="1"]')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
  flush();
  expect(calibration.curve().points[1]).toEqual({ x: 0.9, y: 1 });
  expect(board().querySelector('[data-point="1"]')!.getAttribute('aria-label')).toContain('pen 90%');
  expect(entry.textContent).toContain('2 points');

  // A press on the board's curve adds a point, which the studio's graph shows; strokes map through it at once.
  graphPointer(board(), 'pointerdown', 0.45, 0.5);
  graphPointer(board(), 'pointerup', 0.45, 0.5);
  expect([points(studio()), points(board())]).toEqual([3, 3]);
  expect(entry.textContent).toContain('3 points');
  expect(calibration.mapPressure(0.45)).toBeCloseTo(calibration.curve().points[1]!.y, 3);

  // A point's value in the studio opens the keypad; what it commits moves the point on the board too.
  studio().querySelector('[data-point="1"]')!.dispatchEvent(new FocusEvent('focus'));
  flush();
  const brushValue = studio().querySelector<SVGElement>('[data-entry][aria-label^="Brush pressure"]')!;
  brushValue.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flush();
  const keypad = dialog.querySelector<HTMLElement>('[popover][role="dialog"]')!;
  expect(keypad.getAttribute('aria-label')).toBe('Brush');
  for (const key of ['7', '0']) {
    keypad.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!.click();
    flush();
  }
  [...keypad.querySelectorAll('button')].find((element) => element.textContent === 'OK')!.click();
  flush();
  expect(calibration.curve().points[1]!.y).toBe(0.7);
  expect(board().querySelector('[data-point="1"]')!.getAttribute('aria-label')).toContain('brush 70%');

  // The page's grip knows the curve is on the board, and puts another there at four by four.
  const grip = dialog.querySelector<HTMLElement>('[aria-label="Drag Pen pressure onto the board (on the board)"]')!;
  grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();
  const placed = [...document.querySelectorAll<HTMLElement>('[data-panel] [data-part-kind="value:pen-pressure-curve"]')]
    .map((element) => element.closest<HTMLElement>('[data-part]')!)
    .filter((part) => part.closest('[data-panel]')!.getAttribute('data-panel') !== 'test-panel');
  expect(placed).toHaveLength(1);
  expect([placed[0]!.style.width, placed[0]!.style.height]).toEqual(['188px', '188px']);

  // Cancel puts the pen back as it was when the studio opened: uncalibrated.
  click('Cancel');
  expect(document.querySelector('dialog[aria-label="Brush studio"]')).toBeNull();
  expect(calibration.calibration()).toBeUndefined();
  expect(points(board())).toBe(2);
});

it("keeps the pen's curve on Done, and Cancel returns to the curve the studio opened with", () => {
  storeParts(['action:brush-editor']);
  mount();
  const calibration = wiring.session!.pressureCalibration;
  const opened = {
    points: [
      { x: 0.05, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 0.9, y: 1 }
    ]
  };
  calibration.save(opened);
  flush();
  let dialog = openStudio();
  expect(penEntry(dialog).textContent).toContain('3 points');
  penEntry(dialog).click();
  flush();
  const graph = () => dialog.querySelector('[data-pen-pane] svg[aria-label="Pressure curve"]')!;
  const nudge = () => {
    graph()
      .querySelector('[data-point="1"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    flush();
  };
  nudge();
  expect(calibration.curve().points[1]!.y).toBe(0.7);
  click('Done');
  expect(calibration.curve().points[1]!.y).toBe(0.7);

  dialog = openStudio();
  penEntry(dialog).click();
  flush();
  nudge();
  expect(calibration.curve().points[1]!.y).toBe(0.8);
  // Reset makes the pen uncalibrated at once; Cancel brings back the curve Done kept.
  dialog.querySelector<HTMLButtonElement>('[aria-label="Reset pen pressure"]')!.click();
  flush();
  expect(calibration.calibration()).toBeUndefined();
  click('Cancel');
  expect(calibration.curve().points[1]!.y).toBe(0.7);
});

it("shows the pen's raw pressure on the pad as a dot on every copy of the curve, and its strokes as a histogram", () => {
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({
      version: 2,
      board: {
        panels: [
          {
            id: 'test-panel',
            at: { x: 12, y: 12 },
            parts: [
              {
                id: 'settings',
                kind: 'action:brush-editor',
                cell: { column: 0, row: 0 },
                span: { columns: 2, rows: 1 }
              },
              {
                id: 'curve',
                kind: 'value:pen-pressure-curve',
                cell: { column: 0, row: 1 },
                span: { columns: 4, rows: 4 }
              }
            ]
          }
        ]
      }
    })
  );
  mount();
  const dialog = openStudio();
  penEntry(dialog).click();
  flush();
  const markers = () => document.querySelectorAll('svg[aria-label="Pressure curve"] circle[class*="marker"]').length;
  const bars = () =>
    [...dialog.querySelectorAll('[data-pen-pane] svg[aria-label="Pressure curve"] rect')].filter(
      (bar) => Number(bar.getAttribute('height')) > 0
    ).length;
  expect([markers(), bars()]).toEqual([0, 0]);
  // jsdom lays nothing out, so the pad draws no canvas of its own: a canvas stands in for its paper.
  const paper = document.createElement('canvas');
  dialog.querySelector('[aria-label="Drawing pad"] > div')!.append(paper);
  const pen = (type: string, extra: Record<string, unknown>) => {
    const event = new MouseEvent(type, { bubbles: true });
    for (const [key, value] of Object.entries({ pointerId: 7, pointerType: 'pen', ...extra })) {
      Object.defineProperty(event, key, { value });
    }

    paper.dispatchEvent(event);
    flush();
  };
  pen('pointerdown', { pressure: 0.4, timeStamp: 0, buttons: 1 });
  expect(markers()).toBe(2);
  const samples = Array.from({ length: 50 }, (_, index) => ({ timeStamp: index * 4, pressure: 0.4, buttons: 1 }));
  pen('pointermove', { ...samples.at(-1), getCoalescedEvents: () => samples });
  pen('pointerup', { pressure: 0, timeStamp: 200 });
  expect(markers()).toBe(0);
  expect(bars()).toBe(1);

  // A new visit starts with an empty histogram.
  click('Done');
  const again = openStudio();
  penEntry(again).click();
  flush();
  expect(
    [...again.querySelectorAll('[data-pen-pane] svg[aria-label="Pressure curve"] rect')].filter(
      (bar) => Number(bar.getAttribute('height')) > 0
    )
  ).toHaveLength(0);
});

it('runs the calibration steps on the Pen page from its Measure button, and offers the curve in the box', () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();
  penEntry(dialog).click();
  flush();
  dialog.querySelector<HTMLButtonElement>('[aria-label="Measure pen pressure"]')!.click();
  flush();
  const pane = dialog.querySelector('[data-pen-pane]')!;
  expect(pane.querySelector('[aria-current="step"]')?.getAttribute('aria-label')).toBe('As usual');
  // The graph stays above the steps, which draw on the pad and have no canvas of their own.
  expect(pane.querySelector('svg[aria-label="Pressure curve"]')).not.toBeNull();
  expect(pane.querySelector('[data-pen-measure] canvas')).toBeNull();
  expect(wiring.session!.windows.isOpen('pressure')).toBe(false);
  pane.querySelector<HTMLButtonElement>('[data-pen-measure] button[aria-label="Cancel"]')!.click();
  flush();
  expect(pane.querySelector('[aria-current="step"]')).toBeNull();
  expect(pane.querySelector('svg[aria-label="Pressure curve"]')).not.toBeNull();
  click('Done');

  const tools = boxSections.find((section) => section.id === 'Tools')!.kinds;
  expect(tools.indexOf('value:pen-pressure-curve')).toBe(tools.indexOf('action:pressure') + 1);
  expect(partDefinition('value:brush:pressure-curve')?.kind).toBe('value:pen-pressure-curve');
});

it('opens the studio on the Pen page from the Pressure calibration part, never the old window', () => {
  storeParts(['action:pressure']);
  mount();
  document.querySelector<HTMLButtonElement>('[data-part-kind="action:pressure"] button')!.click();
  flush();
  const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Brush studio"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.querySelector('[data-pen-pane] svg[aria-label="Pressure curve"]')).not.toBeNull();
  expect(penEntry(dialog).getAttribute('aria-current') ?? penEntry(dialog).getAttribute('aria-selected')).toBeTruthy();
  expect(dialog.querySelector('[aria-current="step"]')).toBeNull();
  expect(wiring.session!.windows.isOpen('pressure')).toBe(false);
  click('Done');

  // The Brush settings part still opens the studio on its first category.
  storeParts(['action:brush-editor']);
  dispose?.();
  mount();
  expect(openStudio().querySelector('[data-pen-pane]')).toBeNull();
});

it("measures from the board's curve in the studio, on its pad, and Cancel brings back the curve it opened with", () => {
  storeParts(['action:brush-editor', 'value:pen-pressure-curve']);
  const stored = JSON.parse(localStorage.getItem('paint.lego')!);
  stored.board.panels[0].parts[1].span = { columns: 4, rows: 4 };
  stored.board.panels[0].parts[1].cell = { column: 0, row: 1 };
  localStorage.setItem('paint.lego', JSON.stringify(stored));
  mount();
  const calibration = wiring.session!.pressureCalibration;
  const opened = {
    points: [
      { x: 0.05, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 0.9, y: 1 }
    ]
  };
  calibration.save(opened);
  flush();
  document.querySelector<HTMLButtonElement>('[data-panel] [aria-label="Measure pen pressure"]')!.click();
  flush();
  const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Brush studio"]')!;
  const pane = dialog.querySelector('[data-pen-pane]')!;
  const steps = () =>
    [...pane.querySelectorAll('ol[aria-label="Steps"] > li')].map((step) => step.getAttribute('aria-current'));
  const meter = () => Number(pane.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow'));
  const bars = () =>
    [...pane.querySelectorAll('svg[aria-label="Pressure curve"] rect')].filter(
      (bar) => Number(bar.getAttribute('height')) > 0
    ).length;
  expect(steps()).toEqual(['step', null, null]);
  expect(wiring.session!.windows.isOpen('pressure')).toBe(false);
  // No sentence tells what to do: the steps' block has no text at all.
  expect(pane.querySelector('[data-pen-measure]')!.textContent!.trim()).toBe('');

  // jsdom lays nothing out, so the pad draws no canvas of its own: a canvas stands in for its paper.
  const paper = document.createElement('canvas');
  dialog.querySelector('[aria-label="Drawing pad"] > div')!.append(paper);
  const stroke = (pressure: (t: number) => number, pointerType = 'pen') => {
    const samples = Array.from({ length: 250 }, (_, index) => ({
      timeStamp: index * 4,
      pressure: pressure(index / 249),
      buttons: 1
    }));
    const send = (type: string, extra: Record<string, unknown>) => {
      const event = new MouseEvent(type, { bubbles: true });
      for (const [key, value] of Object.entries({ pointerId: 9, pointerType, ...extra })) {
        Object.defineProperty(event, key, { value });
      }

      paper.dispatchEvent(event);
      flush();
    };
    send('pointerdown', { ...samples[0] });
    send('pointermove', { ...samples.at(-1), getCoalescedEvents: () => samples.slice(1) });
    send('pointerup', { timeStamp: 1000, pressure: 0 });
  };
  stroke(() => 1, 'touch');
  expect([meter(), bars()]).toEqual([0, 0]);
  expect(pane.querySelector('[aria-label="Pen only"]')).not.toBeNull();
  stroke((t) => 0.4 + 0.3 * t);
  expect(meter()).toBeGreaterThan(200);
  expect(bars()).toBeGreaterThan(0);
  expect(pane.querySelector('[aria-label="Pen only"]')).toBeNull();
  for (const [count, pressure] of [
    [4, (t: number) => 0.4 + 0.3 * t],
    [2, (t: number) => 0.75 + 0.1 * t],
    [2, (t: number) => 0.08 + 0.04 * t]
  ] as const) {
    for (let index = 0; index < count; index++) {
      stroke(pressure);
    }

    pane.querySelector<HTMLButtonElement>('button[aria-label="Next"], button[aria-label="Finish"]')!.click();
    flush();
  }

  // The fitted curve is the pen's at once, shown on the page's graph and on the board's.
  expect(pane.querySelector('[data-pen-measure]')).toBeNull();
  expect(calibration.curve().points).toHaveLength(5);
  expect(calibration.curve().points[0]!.x).toBeGreaterThan(0.07);
  expect(pane.querySelectorAll('svg[aria-label="Pressure curve"] [data-point]')).toHaveLength(5);
  click('Cancel');
  expect(calibration.curve()).toEqual(opened);

  // Done keeps a measured curve.
  document.querySelector<HTMLButtonElement>('[data-panel] [aria-label="Measure pen pressure"]')!.click();
  flush();
  const again = document.querySelector<HTMLDialogElement>('dialog[aria-label="Brush studio"]')!;
  again.querySelector('[aria-label="Drawing pad"] > div')!.append(paper);
  for (const [count, pressure] of [
    [5, (t: number) => 0.4 + 0.3 * t],
    [2, (t: number) => 0.75 + 0.1 * t],
    [2, (t: number) => 0.08 + 0.04 * t]
  ] as const) {
    for (let index = 0; index < count; index++) {
      stroke(pressure);
    }

    again.querySelector<HTMLButtonElement>('button[aria-label="Next"], button[aria-label="Finish"]')!.click();
    flush();
  }
  const measured = calibration.curve();
  expect(measured.points).toHaveLength(5);
  click('Done');
  expect(calibration.curve()).toEqual(measured);
});

it("Escape in a studio row's keypad closes the keypad and keeps the studio open", () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();
  const chip = dialog.querySelector<HTMLElement>('[data-part-kind="value:brush:flow"] [data-value-chip]')!;
  pointer(chip, 'pointerdown', 0, 0);
  pointer(chip, 'pointerup', 0, 0);
  const keypad = dialog.querySelector<HTMLElement>('[popover][role="dialog"]');
  expect(keypad).not.toBeNull();
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  keypad!.dispatchEvent(escape);
  flush();
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog.querySelector('[popover][role="dialog"]')).toBeNull();
  expect(document.querySelector('dialog[aria-label="Brush studio"]')).toBe(dialog);
});

it("Enter on a studio row's grip puts the part on the board without dragging", () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();
  const grip = dialog.querySelector<HTMLElement>('[aria-label="Drag Flow onto the board"]')!;
  grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();
  const placed = document.querySelector<HTMLElement>('[data-panel] [data-part-kind="value:brush:flow"]');
  expect(placed).not.toBeNull();
  expect(placed!.closest<HTMLElement>('[data-part]')!.style.width).toBe('188px');
  expect(placed!.closest('[data-panel]')!.getAttribute('data-panel')).not.toBe('test-panel');
  expect(dialog.querySelector('[aria-label="Drag Flow onto the board (on the board)"]')).not.toBeNull();
  expect(document.querySelector('dialog[aria-label="Brush studio"]')).toBe(dialog);
});

it('joins the chosen category to its settings, with no sidebar style to choose', () => {
  storeParts(['action:brush-editor']);
  localStorage.setItem('paint.brushStudio.sidebar', 'sidebar');
  mount();
  const dialog = openStudio();
  expect(dialog.querySelector('[aria-label="Sidebar style (trial)"]')).toBeNull();
  expect(dialog.querySelector('[data-sidebar]')).toBeNull();
  category(dialog, 'Brush tip');
  const chosen = [...dialog.querySelectorAll<HTMLElement>('nav button[aria-current="page"]')];
  expect(chosen.map((row) => row.dataset.item)).toEqual(['brush-tip']);
  // The joined shape lies in the list itself, ahead of its rows.
  expect(dialog.querySelector('nav > svg:first-child [data-join="fill"]')).not.toBeNull();
});

/** Chooses the category named `name` in the studio's sidebar. */
function category(dialog: HTMLElement, name: string) {
  [...dialog.querySelectorAll<HTMLElement>('nav button')]
    .find((element) => element.textContent?.includes(name))!
    .click();
  flush();
}

/** The sidebar entry of the pen's page in the studio's "Pen" group. */
function penEntry(dialog: HTMLElement) {
  const entry = [...dialog.querySelectorAll<HTMLElement>('nav button')].find(
    (element) => element.querySelector('span span')?.textContent === 'Pressure'
  );
  expect(entry).toBeDefined();
  return entry!;
}

/**
 * A pen event on a pressure curve's graph at raw pressure `raw` and output `value`, the graph laid out at its own
 * 480 × 260 units, as an unmeasured graph is drawn.
 */
function graphPointer(graph: Element, type: string, raw: number, value: number) {
  (graph as SVGSVGElement).getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 260 }) as DOMRect;
  (graph as SVGSVGElement).setPointerCapture = () => undefined;
  const event = new MouseEvent(type, { clientX: 28 + raw * 424, clientY: 232 - value * 204, bubbles: true, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 3 }, pointerType: { value: 'pen' }, pressure: { value: 0.5 } });
  graph.dispatchEvent(event);
  flush();
}

/** Opens the brush studio through the "Brush settings" part on the board and returns its dialog. */
function openStudio() {
  document.querySelector<HTMLButtonElement>('[data-part-kind="action:brush-editor"] button')!.click();
  flush();
  const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Brush studio"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}

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
