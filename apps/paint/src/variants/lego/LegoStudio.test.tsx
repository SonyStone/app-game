// @vitest-environment jsdom
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { defaultPaintSymmetry } from '@app-game/paint-core/symmetry';
import { render } from '@solidjs/web';
import 'fake-indexeddb/auto';
import { err, ok } from 'neverthrow';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEffect, createSignal, flush, untrack } from 'solid-js';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getBrushSetting } from '../../features/brush-editor/schema';
import { hexToWheel } from '../../features/color-wheel';
import type { EngineHandlers } from '../../features/engine/openPaintTransport';
import type { PaintSession } from '../../features/session';
import type { LegoServices } from './LegoServices';
import { LegoStudio } from './LegoStudio';
import { createGrid, defaultCell } from './grid';
import { boxSections, partDefaultSpan, partDefinition } from './parts';

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
  expect(button('Edit')).toBeUndefined();
  enterEdit();
  expect(button('Done')).toBeDefined();
  click('Dismiss');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  click('Done');
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
  expect(localStorage.getItem(key)).toBe(raw);
});

it('keeps the app reactive with both future board and kit data', () => {
  localStorage.setItem('paint.lego', '{"version":6}');
  localStorage.setItem('paint.lego.kits', '{"version":6}');
  mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('newer Paint version');
  enterEdit();
  expect(button('Done')).toBeDefined();
});

it('shows a notice and keeps Edit reactive when a corrupt board cannot be backed up', () => {
  localStorage.setItem('paint.lego', '{broken');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  mount();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Board changes can't be saved");
  enterEdit();
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
  wiring.services!.options.open();
  flush();
  click('Reset board');
  expect(wiring.session!.error()).toBe(failure);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(title);
  expect(button(action)).toBeDefined();
  click('Dismiss');
  click('Reset board');
  expect(wiring.session!.error()).toMatchObject({ kind: 'lego', code: 'storage' });
});

it('mounts no catalog content while closed, including after opening and closing it', () => {
  mount();
  enterEdit();
  expect(document.querySelector('dialog[aria-label="Parts and Options"]')).toBeNull();
  expect(document.querySelector('[class*="kitPreview"]')).toBeNull();
  const dialog = openParts();
  expect(dialog.querySelector('nav[aria-label="Parts and options"]')).not.toBeNull();
  dialog.querySelector<HTMLButtonElement>('[data-item="interface"]')!.click();
  flush();
  expect(button('Reset board')).toBeDefined();
  click('Done');
  expect(document.querySelector('dialog[aria-label="Parts and Options"]')).toBeNull();
  expect(button('Reset board')).toBeUndefined();
});

it('keeps a board part mounted through an edit tap', () => {
  storeParts(['color:pair']);
  mount();
  enterEdit();
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
  // Three cells wide and two high: room for the list of modes under the toggle at the default cell.
  saved.board.panels[0].parts[1].span = { columns: 3, rows: 2 };
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
  enterEdit();
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
  // As long as the studio's row, so both show the name beside the value.
  saved.board.panels[0].parts[1].span = { columns: 6, rows: 1 };
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
  mount(28);
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
  // Just long enough for its name beside its value chip, one cell high: five cells for "Flow" and "100%".
  expect(landed.closest<HTMLElement>('[data-part]')!.style.width).toBe('156px');
  expect(landed.closest<HTMLElement>('[data-part]')!.style.height).toBe('28px');
  expect(landed.querySelector('[role="slider"]')!.textContent).toMatch(/^Flow\d+%$/);
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
  expect(dialog.querySelector('[aria-label="Drag Flow onto the board (on the board)"]')).not.toBeNull();
  expect(dialog.querySelector('[aria-label="Drag Opacity onto the board"]')).not.toBeNull();
});

it("puts a studio row's grip inside its row, the setting's sliders fused into one group", () => {
  storeParts(['action:brush-editor']);
  mount();
  const dialog = openStudio();
  const rows = ['Size', 'Opacity', 'Flow'].map(
    (name) => dialog.querySelector<HTMLElement>(`[aria-label^="Drag ${name} onto the board"]`)!.parentElement!
  );

  // One element is the row's tile: the grip at its left end, then the part across the rest.
  for (const [at, row] of rows.entries()) {
    expect(row.children).toHaveLength(2);
    expect(row.firstElementChild!.matches('button[aria-label^="Drag "]')).toBe(true);
    expect(
      row.lastElementChild!.querySelector(
        `[data-part-kind="${['value:size', 'value:opacity', 'value:brush:flow'][at]}"]`
      )
    ).not.toBeNull();
  }

  // Photoshop's blend mode stands between Size and Opacity, so Size is a group of its own.
  expect(rows[0]!.parentElement!.dataset.family).toBe('slider');
  expect([...rows[0]!.parentElement!.children]).toEqual([rows[0]]);
  expect(rows[1]!.parentElement!.dataset.family).toBe('slider');
  expect([...rows[1]!.parentElement!.children]).toEqual(rows.slice(1));

  // The row draws the tile and its corners; the grip takes the left ones and the part the right ones, with no gap.
  const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'LegoStudio.module.css'), 'utf8');
  const rule = (selector: string) => new RegExp(`^${selector} \\{([\\s\\S]*?)^\\}`, 'm').exec(css)![1]!;
  expect(rule('\\.studioSetting')).toMatch(/background: var\(--lego-tile\);/);
  expect(rule('\\.studioSetting')).toMatch(
    /border-radius: var\(--studio-row-top\) var\(--studio-row-top\) var\(--studio-row-bottom\) var\(--studio-row-bottom\);/
  );
  expect(rule('\\.studioSetting')).not.toMatch(/(^|\s)gap:/m);
  expect(rule('\\.studioGrip')).toMatch(
    /border-radius: var\(--studio-row-top\) 0 0 var\(--studio-row-bottom\);\s+background: transparent;/
  );
  expect(rule('\\.studioTile')).toMatch(
    /\.studioSetting > & \{\s+border-radius: 0 var\(--studio-row-top\) var\(--studio-row-bottom\) 0;/
  );
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
                span: { columns: 6, rows: 6 }
              }
            ]
          }
        ]
      }
    })
  );
  mount(28);
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

  // The page's grip knows the curve is on the board, and puts another there at six by six with 28 px cells.
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

it('saves the edited brush as a new one from the studio header, goes on with it, and Cancel returns to it as saved', async () => {
  storeParts(['action:brush-editor']);
  mount();
  const { tools, library } = wiring.session!;
  await tools.loaded;
  tools.selectPreset('builtin:soft-round', 'brush');
  // Changed on the board before the studio opened; the studio then makes the brush 48 px.
  tools.updateBrush({ size: 40 });
  flush();
  const before = tools.rememberedChanges('builtin:soft-round');
  const dialog = openStudio();
  const title = () => dialog.querySelector('h1')!.textContent;
  await studioSize(48);
  expect(title()).toBe('Soft round');

  // Naming asks in place, offering the next free name, selected so typing replaces it; Escape ends only the naming.
  saveAsNew(dialog);
  let field = nameField(dialog)!;
  expect(field.value).toMatch(/^Soft round \d+$/);
  expect(library.presets().map(({ name }) => name)).not.toContain(field.value);
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
  expect(button('Cancel')).toBeUndefined();
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  field.dispatchEvent(escape);
  flush();
  // Kept from the dialog, whose Escape would close the studio.
  expect(escape.defaultPrevented).toBe(true);
  expect(nameField(dialog)).toBeNull();
  expect(dialog.isConnected).toBe(true);
  expect(title()).toBe('Soft round');

  saveAsNew(dialog);
  field = nameField(dialog)!;
  field.value = 'Scattered round';
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  flush();
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await vi.waitFor(() => {
    flush();
    expect(title()).toBe('Scattered round');
  });
  expect(nameField(dialog)).toBeNull();
  const copy = library.find(tools.preset())!;
  expect(copy).toMatchObject({ name: 'Scattered round', derivedFrom: 'builtin:soft-round' });
  expect(tools.brush().size).toBe(48);
  expect(tools.rememberedChanges('builtin:soft-round')).toEqual(before);

  // Cancel returns to the new brush as it was saved, not to the original.
  await studioSize(60);
  click('Cancel');
  expect(document.querySelector('dialog[aria-label="Brush studio"]')).toBeNull();
  expect(tools.preset()).toBe(copy.id);
  expect(tools.brush().size).toBe(48);

  // Done keeps later edits as ever.
  openStudio();
  await studioSize(70);
  click('Done');
  expect(tools.preset()).toBe(copy.id);
  expect(tools.brush().size).toBe(70);
});

it('keeps the original brush and the naming when the new brush cannot be saved, and tells why', async () => {
  storeParts(['action:brush-editor']);
  mount();
  const { tools, library } = wiring.session!;
  await tools.loaded;
  tools.selectPreset('builtin:soft-round', 'brush');
  flush();
  const opened = tools.brush().size;
  const dialog = openStudio();
  await studioSize(48);
  const count = library.presets().length;
  const refused = 'Brush changes could not be saved on this device.';
  vi.spyOn(library, 'addStored').mockResolvedValue(err({ kind: 'brush', code: 'storage', message: refused }));

  saveAsNew(dialog);
  const offered = nameField(dialog)!.value;
  nameField(dialog)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await vi.waitFor(() => {
    flush();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(refused);
  });
  expect(nameField(dialog)?.value).toBe(offered);
  expect(dialog.querySelector('h1')!.textContent).toBe('Soft round');
  expect(tools.preset()).toBe('builtin:soft-round');
  expect(library.presets()).toHaveLength(count);

  // Cancel still returns to the brush as the studio opened it.
  dialog.querySelector<HTMLButtonElement>('[aria-label="Cancel new brush"]')!.click();
  flush();
  click('Cancel');
  expect(tools.brush().size).toBe(opened);
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
                span: { columns: 6, rows: 6 }
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
  stored.board.panels[0].parts[1].span = { columns: 6, rows: 6 };
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
  mount(28);
  const dialog = openStudio();
  const grip = dialog.querySelector<HTMLElement>('[aria-label="Drag Flow onto the board"]')!;
  grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();
  const placed = document.querySelector<HTMLElement>('[data-panel] [data-part-kind="value:brush:flow"]');
  expect(placed).not.toBeNull();
  expect(placed!.closest<HTMLElement>('[data-part]')!.style.width).toBe('156px');
  expect(placed!.closest('[data-panel]')!.getAttribute('data-panel')).not.toBe('test-panel');
  expect(dialog.querySelector('[aria-label="Drag Flow onto the board (on the board)"]')).not.toBeNull();
  expect(document.querySelector('dialog[aria-label="Brush studio"]')).toBe(dialog);
});

it("marks the chosen category on the sidebar's sliding pill, with no sidebar style to choose", () => {
  storeParts(['action:brush-editor']);
  localStorage.setItem('paint.brushStudio.sidebar', 'joined');
  mount();
  const dialog = openStudio();
  expect(dialog.querySelector('[aria-label="Sidebar style (trial)"]')).toBeNull();
  expect(dialog.querySelector('[data-sidebar]')).toBeNull();
  category(dialog, 'Brush tip');
  const chosen = [...dialog.querySelectorAll<HTMLElement>('nav button[aria-current="page"]')];
  expect(chosen.map((row) => row.dataset.item)).toEqual(['brush-tip']);
  // The pill lies in the list itself, ahead of its rows; no joined shape is drawn.
  expect(dialog.querySelector('nav > span[aria-hidden="true"]:first-child')).not.toBeNull();
  expect(dialog.querySelector('[data-join]')).toBeNull();
});

it('opens Options from its part and from the File menu, and closes it with Done, Escape and the back gesture', () => {
  storeParts(['action:options', 'action:file']);
  mount();
  expect(optionsSheet()).toBeNull();

  const fromPart = openOptions();
  expect(fromPart.querySelector('nav[aria-label="Parts and options"]')).not.toBeNull();
  expect(fromPart.querySelector('section[data-section="interface"]')).not.toBeNull();
  click('Done');
  expect(optionsSheet()).toBeNull();

  document.querySelector<HTMLButtonElement>('[data-part-kind="action:file"] button')!.click();
  flush();
  const entry = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (item) => item.textContent === 'Options'
  )!;
  entry.click();
  flush();
  // The menu closes as the sheet opens.
  expect(document.querySelector('[role="menu"]')).toBeNull();
  // The browser's cancel, which Escape inside the modal sheet sends.
  optionsSheet()!.dispatchEvent(new Event('cancel', { cancelable: true }));
  flush();
  expect(optionsSheet()).toBeNull();

  // The page's Escape, the same handler the Android back gesture runs.
  openOptions();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  expect(optionsSheet()).toBeNull();
  expect(button('Edit')).toBeUndefined();
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
});

it("lays the grid out anew at once as Options' grid size changes, and keeps the size on the device", () => {
  storeParts(['action:options']);
  mount();
  expect(editorStyle('--lego-cell')).toBe(`${defaultCell}px`);
  const sheet = openOptions();
  const setting = sheet.querySelector<HTMLElement>('[data-part-kind="value:grid-size"]')!;
  expect(setting.textContent).toContain(`${defaultCell}px`);
  // The sample of real parts lies in the section.
  const sample = sheet.querySelector<HTMLElement>('[data-grid-sample]')!;
  expect(sample.querySelectorAll('[data-part-kind]')).toHaveLength(7);
  const sampleWidth = () =>
    (sample.querySelector('[data-part-kind="value:size"]')!.parentElement!.parentElement as HTMLElement).style.width;
  expect(sampleWidth()).toBe(`${createGrid(() => defaultCell).length(4)}px`);

  typeValue(setting, '40');
  expect(editorStyle('--lego-cell')).toBe('40px');
  expect(editorStyle('--lego-radius')).toBe(`${(18 * 40) / 44}px`);
  expect(setting.textContent).toContain('40px');
  expect(sampleWidth()).toBe(`${4 * 44 - 4}px`);
  expect(JSON.parse(localStorage.getItem('paint.lego.options')!)).toEqual({ cell: 40 });

  // Out of range or between steps, a typed size settles within the range on a whole step.
  typeValue(setting, '99');
  expect(editorStyle('--lego-cell')).toBe('52px');

  dispose?.();
  dispose = undefined;
  flush();
  document.body.replaceChildren();
  mount();
  expect(editorStyle('--lego-cell')).toBe('52px');
});

it.each([
  { stored: { 'paint.lego.options': '{"cell":36}' }, cell: '36px', kept: '{"cell":36}' },
  {
    stored: { 'paint.lego.tile-look': '{"radius":18,"squircle":true,"cellSize":28}' },
    cell: '28px',
    kept: '{"cell":28}'
  },
  { stored: { 'paint.lego.tile-look': '{"radius":18,"squircle":true}' }, cell: `${defaultCell}px`, kept: '{}' },
  { stored: { 'paint.lego.options': '{not json' }, cell: `${defaultCell}px`, kept: '{not json' },
  { stored: { 'paint.lego.options': '{"cell":"big"}' }, cell: `${defaultCell}px`, kept: '{"cell":"big"}' },
  {
    stored: { 'paint.lego.options': '{"cell":30}', 'paint.lego.tile-look': '{"cellSize":44}' },
    cell: '30px',
    kept: '{"cell":30}'
  }
])('starts at the stored grid size: $stored', ({ stored, cell, kept }) => {
  for (const [key, value] of Object.entries(stored)) {
    localStorage.setItem(key, value);
  }

  mount();
  expect(editorStyle('--lego-cell')).toBe(cell);
  expect(localStorage.getItem('paint.lego.options')).toBe(kept);
  // A trial's size is carried over once: its entry goes; once the options are stored, it is not read at all.
  expect(localStorage.getItem('paint.lego.tile-look')).toBe(
    'paint.lego.options' in stored ? (stored['paint.lego.tile-look' as keyof typeof stored] ?? null) : null
  );
});

it('starts at the host cell, or the default, when storage refuses every read and write', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Denied', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Denied', 'SecurityError');
  });
  dispose = render(() => <LegoStudio cellSize={38} />, document.body);
  flush();
  expect(editorStyle('--lego-cell')).toBe('38px');
  dispose();
  dispose = undefined;
  flush();
  document.body.replaceChildren();
  mount();
  expect(editorStyle('--lego-cell')).toBe(`${defaultCell}px`);
});

it("lets the user's stored grid size win over the host's cell", () => {
  localStorage.setItem('paint.lego.options', '{"cell":44}');
  dispose = render(() => <LegoStudio cellSize={38} />, document.body);
  flush();
  expect(editorStyle('--lego-cell')).toBe('44px');
});

it("makes the unified dialog's sections two screens on narrow views, opening under a way back", () => {
  storeParts(['action:options']);
  mount();
  const sheet = openOptions();
  const list = sheet.querySelector<HTMLElement>('nav[aria-label="Parts and options"]')!;
  const split = list.parentElement!.parentElement!;
  expect(split.dataset.view).toBe('list');
  expect([...list.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(['Settings', 'Parts']);
  expect(list.querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('interface');

  list.querySelector<HTMLButtonElement>('[data-item="interface"]')!.click();
  flush();
  expect(split.dataset.view).toBe('detail');
  const back = [...sheet.querySelectorAll('button')].find((element) => element.textContent === 'Sections')!;
  expect(back.parentElement!.textContent).toBe('SectionsInterface');
  back.click();
  flush();
  expect(split.dataset.view).toBe('list');
});

it('leaves nothing of the tile look trial but the one-time carry-over of its cell size', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = path.resolve(here, '../..');
  const files = readdirSync(source, { recursive: true, encoding: 'utf8' }).filter(
    (name) => /\.(css|tsx?)$/.test(name) && !name.includes('.test.')
  );
  const mentions = files.filter((name) =>
    /tile-look|tileLook|TileLook|squircleLook/.test(readFileSync(path.join(source, name), 'utf8'))
  );
  // Only the options' carry-over names the trial's key, and reads it only while the options are not stored.
  expect(mentions).toEqual([path.join('variants', 'lego', 'options.ts')]);
  expect(readFileSync(path.join(source, mentions[0]!), 'utf8').match(/tile-look/g)).toHaveLength(1);
});

/** The unified Parts & Options dialog, if open. */
function optionsSheet() {
  return document.querySelector<HTMLDialogElement>('dialog[aria-label="Parts and Options"]');
}

/** Opens Options through its part on the board and returns its dialog. */
function openOptions() {
  document.querySelector<HTMLButtonElement>('[data-part-kind="action:options"] button')!.click();
  flush();
  const sheet = optionsSheet();
  expect(sheet).not.toBeNull();
  return sheet!;
}

/** The editor's inline custom property `name`. */
function editorStyle(name: string) {
  return document.querySelector<HTMLElement>('[style*="--lego-cell"]')!.style.getPropertyValue(name);
}

/** Types `digits` on the keypad of `part`'s value chip, then OK. */
function typeValue(part: HTMLElement, digits: string) {
  const chip = part.querySelector<HTMLElement>('[data-value-chip]')!;
  pointer(chip, 'pointerdown', 0, 0);
  pointer(chip, 'pointerup', 0, 0);
  const keypad = document.querySelector<HTMLElement>('[popover][role="dialog"]')!;
  for (const key of [...digits, 'Enter']) {
    keypad.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    flush();
  }
}

/** Chooses the category named `name` in the studio's sidebar. */
function category(dialog: HTMLElement, name: string) {
  [...dialog.querySelectorAll<HTMLElement>('nav button')]
    .find((element) => element.textContent?.includes(name))!
    .click();
  flush();
}

/** Makes the brush `size` px through the open studio's document, as its Size row does, and waits for the edit. */
async function studioSize(size: number) {
  const editor = wiring.services!.brushEditor;
  expect(await editor.update(getBrushSetting('size')!.write(editor.view()!, size as never))).toBe(true);
  flush();
}

/** Presses the studio header's "Save as new". */
function saveAsNew(dialog: HTMLElement) {
  dialog.querySelector<HTMLButtonElement>('[aria-label="Save as new brush"]')!.click();
  flush();
}

/** The field naming a new brush in the studio's header, while it asks. */
function nameField(dialog: HTMLElement) {
  return dialog.querySelector<HTMLInputElement>('input[aria-label="New brush name"]');
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
function mount(cellSize?: number) {
  dispose = render(() => <LegoStudio cellSize={cellSize} />, document.body);
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

/** Enters layout edit mode through the studio's editLayout capability. */
function enterEdit() {
  wiring.services!.options.editLayout();
  flush();
}

/** Opens the unified Parts & Options dialog through the floating Edit bar's Parts button. */
function openParts() {
  const parts = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Edit layout"] button')].find((el) =>
    el.textContent?.includes('Parts')
  );
  expect(parts).toBeDefined();
  parts!.click();
  flush();
  const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Parts and Options"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}

it('hides any permanent Edit button in live mode and enters Edit via File menu, Options, or long-pressing a panel', () => {
  vi.useFakeTimers();
  try {
    storeParts(['action:file', 'action:options', 'action:undo']);
    mount();

    // No permanent Edit button in the corner controls in live mode.
    expect(button('Edit')).toBeUndefined();
    expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();

    // 1) Enter via File → Edit layout.
    document.querySelector<HTMLButtonElement>('[data-part-kind="action:file"] button')!.click();
    flush();
    const fileItem = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Edit layout'
    )!;
    fileItem.click();
    flush();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.querySelector('[aria-label="Edit layout"]')).not.toBeNull();
    // Canvas stays 1:1 with no card scaling.
    expect(document.querySelector('[class*="carded"]')).toBeNull();
    click('Done');
    expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();

    // 2) Enter via Options → Interface → Edit layout.
    const sheet = openOptions();
    const optionsButton = [...sheet.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent?.trim() === 'Edit layout'
    )!;
    optionsButton.click();
    flush();
    expect(optionsSheet()).toBeNull();
    expect(document.querySelector('[aria-label="Edit layout"]')).not.toBeNull();
    click('Done');

    // 3) Moving a press cancels the long-press timer (protects sliders/pickers/FloatingGrip).
    const undoPart = document.querySelector<HTMLElement>('[data-part="test-2"]')!;
    pointer(undoPart, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', 34, 20);
    vi.advanceTimersByTime(600);
    flush();
    expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
    pointer(window, 'pointerup', 34, 20);

    // 4) Holding still (~450ms) on a LEGO panel/part enters Edit mode without firing the part.
    pointer(undoPart, 'pointerdown', 20, 20);
    vi.advanceTimersByTime(440);
    flush();
    expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
    vi.advanceTimersByTime(20);
    flush();
    expect(document.querySelector('[aria-label="Edit layout"]')).not.toBeNull();
    pointer(window, 'pointerup', 20, 20);
  } finally {
    vi.useRealTimers();
  }
});

it('places the floating Edit bar on a freeSpot clear of panels and lets its grip move it anywhere', () => {
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({
      version: 5,
      board: {
        panels: [
          {
            id: 'top-left',
            at: { x: 0, y: 0 },
            parts: [{ id: 'p0', kind: 'action:undo', cell: { column: 0, row: 0 }, span: { columns: 4, rows: 3 } }]
          }
        ]
      }
    })
  );
  mount();
  enterEdit();

  const panel = document.querySelector<HTMLElement>('[data-panel="top-left"]')!;
  const bar = document.querySelector<HTMLElement>('[aria-label="Edit layout"]')!;
  const panelRect = {
    left: parseFloat(panel.style.left),
    top: parseFloat(panel.style.top),
    width: parseFloat(panel.style.width),
    height: parseFloat(panel.style.height)
  };
  const barLeft = parseFloat(bar.style.left);
  const barTop = parseFloat(bar.style.top);
  // Placed via freeSpot so it does not overlap the top-left panel.
  const separated =
    barLeft + 210 <= panelRect.left ||
    panelRect.left + panelRect.width <= barLeft ||
    barTop + 56 <= panelRect.top ||
    panelRect.top + panelRect.height <= barTop;
  expect(separated).toBe(true);

  // Dragging by the grip moves the Edit bar freely.
  const grip = bar.querySelector<HTMLButtonElement>('[aria-label="Move edit bar"]')!;
  pointer(grip, 'pointerdown', 100, 100);
  pointer(window, 'pointermove', 260, 220);
  pointer(window, 'pointerup', 260, 220);
  expect(parseFloat(bar.style.left)).toBe(barLeft + 160);
  expect(parseFloat(bar.style.top)).toBe(barTop + 120);
});

it('opens the Sidebar Parts catalog, moves away on drag, places onto the 1:1 board, and supports top discard capsule', () => {
  storeParts(['action:undo']);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('role') === 'status' && this.textContent?.includes('Drop to')) {
      return new DOMRect(400, 14, 220, 44);
    }

    return new DOMRect(0, 0, 1024, 768);
  });
  mount();
  enterEdit();

  const dialog = openParts();
  // Floating Edit bar hides while Parts catalog is open.
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
  // Existing board part shows On board badge.
  expect(dialog.querySelector('[title="Undo"]')!.closest('[data-on-board]')?.textContent).toContain('On board');

  // Dragging a new part from Parts hides the dialog with data-away and closes it on board drop.
  const redoTile = dialog.querySelector<HTMLElement>('[title="Redo"]')!;
  pointer(redoTile, 'pointerdown', 120, 220);
  expect(dialog.hasAttribute('data-away')).toBe(false);
  pointer(window, 'pointermove', 500, 420);
  expect(dialog.hasAttribute('data-away')).toBe(true);
  expect(document.body.textContent).toContain('Drop to cancel');
  pointer(window, 'pointerup', 500, 420);

  expect(document.querySelector('dialog[aria-label="Parts and Options"]')).toBeNull();
  expect(document.querySelector('[data-panel] [data-part-kind="action:redo"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Edit layout"]')).not.toBeNull();

  // Dragging a new part onto the top discard capsule cancels placement and returns the catalog.
  const reopened = openParts();
  const eraserTile = reopened.querySelector<HTMLElement>('[title="Eraser"]')!;
  pointer(eraserTile, 'pointerdown', 120, 220);
  pointer(window, 'pointermove', 480, 28);
  expect(reopened.hasAttribute('data-away')).toBe(true);
  pointer(window, 'pointerup', 480, 28);
  expect(document.querySelector('dialog[aria-label="Parts and Options"]')).toBe(reopened);
  expect(reopened.hasAttribute('data-away')).toBe(false);
  expect(document.querySelector('[data-panel] [data-part-kind="action:eraser"]')).toBeNull();

  // Escape closes the catalog first, then exits Edit mode on the next Escape.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  expect(document.querySelector('dialog[aria-label="Parts and Options"]')).toBeNull();
  expect(document.querySelector('[aria-label="Edit layout"]')).not.toBeNull();

  // Dragging an existing board part onto the top red "Drop to put away" capsule removes it from the board.
  const placedRedo = document.querySelector<HTMLElement>('[data-panel] [data-part-kind="action:redo"]')!.closest<HTMLElement>('[data-part]')!;
  pointer(placedRedo, 'pointerdown', 500, 420);
  pointer(window, 'pointermove', 480, 28);
  expect(document.body.textContent).toContain('Drop to put away');
  pointer(window, 'pointerup', 480, 28);
  expect(document.querySelector('[data-panel] [data-part-kind="action:redo"]')).toBeNull();

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
});

it('drags parts out of the unified Options dialog in Live mode at their defaultSpan with matching looks', () => {
  storeParts(['action:options']);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('role') === 'status' && this.textContent?.includes('Drop to')) {
      return new DOMRect(400, 14, 220, 44);
    }

    return new DOMRect(0, 0, 1024, 768);
  });
  mount(28);

  // Verify defaultSpan registry coverage across families.
  expect(partDefaultSpan('value:size')).toEqual({ columns: 4, rows: 1 });
  expect(partDefaultSpan('preset:builtin:soft-round')).toEqual({ columns: 3, rows: 2 });
  expect(partDefaultSpan('color:wheel')).toEqual({ columns: 5, rows: 5 });
  expect(partDefaultSpan('color:swatch')).toEqual({ columns: 2, rows: 2 });
  expect(partDefaultSpan('color:pair')).toEqual({ columns: 2, rows: 1 });
  expect(partDefaultSpan('color:hex')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('color:history')).toEqual({ columns: 4, rows: 1 });
  expect(partDefaultSpan('color:palette')).toEqual({ columns: 4, rows: 2 });
  expect(partDefaultSpan('color:harmony')).toEqual({ columns: 4, rows: 1 });
  expect(partDefaultSpan('color:mask')).toEqual({ columns: 4, rows: 1 });
  expect(partDefaultSpan('layers:list')).toEqual({ columns: 4, rows: 5 });
  expect(partDefaultSpan('layers:name')).toEqual({ columns: 4, rows: 1 });
  expect(partDefaultSpan('layers:blend')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('layers:smooth-color')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('layer:add')).toEqual({ columns: 1, rows: 1 });
  expect(partDefaultSpan('action:brush-editor')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('action:brushes')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('action:eraser')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('action:local-undo')).toEqual({ columns: 3, rows: 1 });
  expect(partDefaultSpan('action:file')).toEqual({ columns: 2, rows: 1 });
  expect(partDefaultSpan('value:pen-pressure-curve')).toEqual({ columns: 5, rows: 4 });
  expect(partDefaultSpan('action:undo')).toEqual({ columns: 1, rows: 1 });

  // Open Options in Live mode (not Edit mode), switch to Values, and drag Size out onto the 1:1 board.
  const dialog = openOptions();
  expect(dialog.querySelector('section[data-section="interface"]')).not.toBeNull();
  dialog.querySelector<HTMLButtonElement>('nav[aria-label="Parts and options"] [data-item="Values"]')!.click();
  flush();

  const sizeTile = dialog.querySelector<HTMLElement>('[title="Size"]')!;
  expect(sizeTile.dataset.span).toBe('4x1');
  // Preview renders Size as a slider (with aria-orientation="horizontal"), not a 1×1 knob.
  expect(sizeTile.querySelector('[role="slider"]')?.getAttribute('aria-orientation')).toBe('horizontal');

  pointer(sizeTile, 'pointerdown', 120, 220);
  expect(dialog.hasAttribute('data-away')).toBe(false);
  pointer(window, 'pointermove', 520, 420);
  expect(dialog.hasAttribute('data-away')).toBe(true);
  pointer(window, 'pointerup', 520, 420);

  // Dialog closes, stays in Live mode, and Size lands on the 1:1 board at 4×1 (124px × 28px at 28px cell).
  expect(optionsSheet()).toBeNull();
  expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();
  const landed = document.querySelector<HTMLElement>('[data-panel] [data-part-kind="value:size"]')!;
  expect(landed).not.toBeNull();
  const partEl = landed.closest<HTMLElement>('[data-part]')!;
  expect(partEl.style.width).toBe('124px');
  expect(partEl.style.height).toBe('28px');
});

it('relays a host cell change to mounted parts, captions and corners while keeping the stored board', () => {
  storeParts(['action:brush-editor']);
  const saved = JSON.parse(localStorage.getItem('paint.lego')!);
  saved.board.panels[0].parts[0].span = { columns: 3, rows: 1 };
  localStorage.setItem('paint.lego', JSON.stringify(saved));
  const [cell, setCell] = createSignal(44);
  dispose = render(() => <LegoStudio cellSize={cell()} />, document.body);
  flush();
  const tile = document.querySelector<HTMLElement>('[data-part="test-0"]')!;
  const editor = tile.closest<HTMLElement>('[style*="--lego-cell"]')!;
  const board = localStorage.getItem('paint.lego');
  expect(tile.style.width).toBe('140px');
  expect(tile.textContent).toBe('Brush settings');
  // Narrower, the name gives way to the short one where only that fits, then to the icon alone.
  setCell(32);
  flush();
  expect(document.querySelector('[data-part="test-0"]')).toBe(tile);
  expect(tile.style.width).toBe('104px');
  expect(tile.textContent).toBe('Settings');
  expect(parseFloat(editor.style.getPropertyValue('--lego-radius'))).toBeCloseTo((18 * 32) / 44);
  setCell(20);
  flush();
  expect(tile.style.width).toBe('68px');
  expect(tile.textContent).toBe('');
  expect(localStorage.getItem('paint.lego')).toBe(board);
});

it('starts at the default cell size, with the plate radius the same share of the cell', () => {
  storeParts(['action:undo']);
  mount();
  const tile = document.querySelector<HTMLElement>('[data-part="test-0"]')!;
  const editor = tile.closest<HTMLElement>('[style*="--lego-cell"]')!;
  expect(editor.style.getPropertyValue('--lego-cell')).toBe(`${defaultCell}px`);
  expect(tile.style.width).toBe(`${createGrid(() => defaultCell).length(2)}px`);
  expect(parseFloat(editor.style.getPropertyValue('--lego-radius'))).toBeCloseTo((18 * defaultCell) / 44);
});

it('composes the default board at 28 px with every caption the 44 px board showed, in less room', () => {
  localStorage.setItem('paint.lego', JSON.stringify({ version: 5, board: boardAt44 }));
  dispose = render(() => <LegoStudio cellSize={44} />, document.body);
  flush();
  const before = boardText();
  const roomBefore = plateArea();
  dispose();
  localStorage.clear();
  document.body.replaceChildren();

  mount(28);
  const after = boardText();
  for (const [id, text] of before) {
    if (after.has(id)) {
      expect(after.get(id), id).toContain(text);
    }
  }

  expect(after.has('layers-strip')).toBe(true);

  // At 44 px the names showed; the parts that carry them did not shrink to icons.
  expect([...before.values()].join(' ')).toContain('Brush settings');
  expect(plateArea()).toBeLessThan(roomBefore * 0.65);
});

it('opens a board stored before the 28 px cells as it was stored, with no part missing, broken or overlapping', () => {
  const stored = JSON.stringify({ version: 5, board: boardAt44 });
  localStorage.setItem('paint.lego', stored);
  mount(28);
  expect(document.querySelector('[aria-label^="Missing part"], [aria-label^="Broken part"]')).toBeNull();
  expect(localStorage.getItem('paint.lego')).toBe(stored);
  for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) {
    const rects = [...panel.querySelectorAll<HTMLElement>('[data-part]')].map((part) => {
      const [left, top, width, height] = ['left', 'top', 'width', 'height'].map((side) =>
        parseFloat(part.style.getPropertyValue(side))
      );
      return { left: left!, top: top!, right: left! + width!, bottom: top! + height! };
    });
    for (const [index, a] of rects.entries()) {
      expect(a.right).toBeLessThanOrEqual(parseFloat(panel.style.width));
      for (const b of rects.slice(index + 1)) {
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
  }

  // Where the text fits, the captions are back: three cells of 28 px name the eraser and shorten Brush settings.
  const text = boardText();
  expect(text.get('eraser')).toBe('Eraser');
  expect(text.get('brush-editor')).toBe('Settings');
  expect(text.get('brightness')).toMatch(/^B\d+%$/);
});

it('shows the Rubylith overlay and inline strip mask controls without any floating top banner', () => {
  localStorage.clear();
  mount();
  expect(document.querySelector('[aria-label="Mask editing mode"]')).toBeNull();
  expect(document.querySelector('[data-rubylith-overlay]')).toBeNull();

  // Switch Glow layer (which has a mask) to mask target: Rubylith overlay appears, no top banner over canvas.
  wiring.services!.layersPrototype.select('layer-glow', 'mask');
  flush();

  expect(document.querySelector('[aria-label="Mask editing mode"]')).toBeNull();
  expect(document.querySelector('[data-rubylith-overlay]')).not.toBeNull();

  const toolbar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Mask controls"]')!;
  expect(toolbar).not.toBeNull();

  const redOverlayBtn = toolbar.querySelector<HTMLButtonElement>('[aria-label="Red mask overlay"]')!;
  redOverlayBtn.click();
  flush();
  expect(document.querySelector('[data-rubylith-overlay]')).toBeNull();
  redOverlayBtn.click();
  flush();
  expect(document.querySelector('[data-rubylith-overlay]')).not.toBeNull();

  const brushBtn = toolbar.querySelector<HTMLButtonElement>('[data-mask-brush]')!;
  brushBtn.click();
  flush();
  expect(wiring.services!.layersPrototype.maskBrush()).toBe('hide');

  const exitBtn = toolbar.querySelector<HTMLButtonElement>('[aria-label="Exit mask mode"]')!;
  exitBtn.click();
  flush();
  expect(wiring.services!.layersPrototype.target()).toBe('layer');
  expect(document.querySelector('[data-rubylith-overlay]')).toBeNull();
  expect(document.querySelector('[role="toolbar"][aria-label="Mask controls"]')).toBeNull();
});

it('does not trigger board Edit Mode when holding still on a layer tile inside layers:strip', () => {
  vi.useFakeTimers();
  try {
    localStorage.clear();
    mount();
    const glowTile = document.querySelector<HTMLElement>('[data-layer-tile="layer-glow"]')!;
    expect(glowTile).not.toBeNull();

    const down = new MouseEvent('pointerdown', { clientX: 20, clientY: 20, button: 0, bubbles: true, cancelable: true });
    Object.defineProperties(down, { pointerId: { value: 7 }, pointerType: { value: 'touch' } });
    glowTile.dispatchEvent(down);
    flush();

    // After 220ms touch hold, layer tile lifts for drag.
    vi.advanceTimersByTime(240);
    flush();
    expect(glowTile.hasAttribute('data-dragging')).toBe(true);

    // Even well past 450ms (board edit long-press threshold), board stays in live mode.
    vi.advanceTimersByTime(400);
    flush();
    expect(document.querySelector('[aria-label="Edit layout"]')).toBeNull();

    const up = new MouseEvent('pointerup', { clientX: 20, clientY: 20, button: 0, bubbles: true, cancelable: true });
    Object.defineProperties(up, { pointerId: { value: 7 }, pointerType: { value: 'touch' } });
    window.dispatchEvent(up);
    flush();
  } finally {
    vi.useRealTimers();
  }
});

/** Each part's text on the board, by its id. */
function boardText() {
  return new Map(
    [...document.querySelectorAll<HTMLElement>('[data-panel] [data-part]')].map((part) => [
      part.getAttribute('data-part')!,
      part.textContent ?? ''
    ])
  );
}

/** The area in square CSS pixels the board's plates take. */
function plateArea() {
  return [...document.querySelectorAll<HTMLElement>('[data-panel]')].reduce(
    (sum, panel) => sum + parseFloat(panel.style.width) * parseFloat(panel.style.height),
    0
  );
}

/** The default board as it was composed for 44 px cells, before 2026-11-19. */
const boardAt44 = (() => {
  const part = (id: string, kind: string, column: number, row: number, columns = 1, rows = 1, look?: string) => ({
    id,
    kind,
    cell: { column, row },
    span: { columns, rows },
    ...(look ? { looks: { [`${columns}x${rows}`]: look } } : {})
  });
  return {
    panels: [
      {
        id: 'tools',
        at: { x: 0.02, y: 0.12 },
        parts: [
          part('soft', 'preset:builtin:soft-round', 0, 0, 3, 2),
          part('brushes', 'action:brushes', 0, 2, 3),
          part('eraser', 'action:eraser', 0, 3, 3),
          part('lasso', 'action:lasso', 0, 4),
          part('fill', 'action:fill', 1, 4),
          part('transform', 'action:transform', 2, 4),
          part('undo', 'action:undo', 0, 5),
          part('redo', 'action:redo', 1, 5),
          part('size-knob', 'value:size', 2, 5),
          part('local-undo', 'action:local-undo', 0, 6, 3),
          part('brush-editor', 'action:brush-editor', 0, 8, 3),
          part('file', 'action:file', 0, 7, 3)
        ]
      },
      {
        id: 'colors',
        at: { x: 0.3, y: 0.02 },
        parts: [
          part('color', 'color:swatch', 0, 0, 2, 2),
          part('hue', 'value:hue', 2, 0, 5),
          part('brightness', 'value:brightness', 2, 1, 5)
        ]
      },
      {
        id: 'stroke',
        at: { x: 0.95, y: 0.3 },
        parts: [part('size', 'value:size', 0, 0, 1, 4), part('opacity', 'value:opacity', 1, 0, 1, 4)]
      },
      {
        id: 'layers-panel',
        at: { x: 0.17, y: 0.5 },
        floating: true,
        parts: [
          part('layers-name', 'layers:name', 0, 0, 5),
          part('layers-blend', 'layers:blend', 0, 1, 3),
          part('layers-opacity', 'value:layer-opacity', 3, 1, 2, 1, 'number'),
          ...['lock', 'clip', 'up', 'down', 'merge-down'].map((kind, column) =>
            part(`layers-${kind}`, `layer:${kind}`, column, 2)
          ),
          part('layers-list', 'layers:list', 0, 3, 5, 5, 'wide'),
          ...['add', 'duplicate', 'delete'].map((kind, column) => part(`layers-${kind}`, `layer:${kind}`, column, 8)),
          part('layers-smooth', 'layers:smooth-color', 3, 8, 2)
        ]
      }
    ]
  };
})();
