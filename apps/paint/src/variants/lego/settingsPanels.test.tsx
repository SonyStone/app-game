// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { BrushLibrary } from '../procreate/BrushLibrary';
import { createBoard } from './createBoard';
import { createKits } from './kits';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { partFamilies, PartsTray } from './PartsTray';
import { createTestServices } from './testServices';

vi.mock('@app-game/paint-core/preview/client', () => ({
  attachStrokePreview: () => ({ update: vi.fn(), pause: vi.fn(), dispose: vi.fn() })
}));

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
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
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  flush();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("chooses the catalog's category in a sidebar, shows only its items, and keeps the choice across close", () => {
  const { services } = owned(createTestServices);
  const [open, setOpen] = createSignal(true);
  const kits = owned(createKits);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        open={open()}
        presets={services.presets.all}
        kits={kits}
        onLift={vi.fn()}
        onLiftKit={vi.fn()}
        onReset={vi.fn()}
        onClose={() => setOpen(false)}
        flashKit={undefined}
      />
    </LegoServicesContext>
  ));
  const families = partFamilies(services.presets.all);
  const sidebar = () => document.querySelector<HTMLElement>('nav[aria-label="Families of parts"]')!;
  const rows = () => [...sidebar().querySelectorAll<HTMLButtonElement>('[data-item]')];
  const pane = () => document.querySelector<HTMLElement>('dialog[aria-label="Parts"] section')!;
  const shownParts = () => pane().querySelectorAll('[title]').length;

  expect(rows().map((row) => [row.dataset.item, row.textContent])).toEqual([
    ['Kits', `Kits${kits.kits().length}`],
    ...families.map((family) => [family.id, `${family.title}${family.kinds.length}`])
  ]);
  // The chosen category lies on the list's one sliding pill; nothing joins it to the parts.
  expect(sidebar().firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  expect(sidebar().querySelector('[data-join]')).toBeNull();
  expect(
    rows()
      .filter((row) => row.getAttribute('aria-current') === 'page')
      .map((row) => row.dataset.item)
  ).toEqual(['Tools']);
  expect(pane().getAttribute('aria-label')).toBe('Tools');
  expect(shownParts()).toBe(families.find((family) => family.id === 'Tools')!.kinds.length);

  rows()
    .find((row) => row.dataset.item === 'Kits')!
    .click();
  flush();
  expect(pane().getAttribute('aria-label')).toBe('Kits');
  expect(pane().querySelector('[title="Kit: Layers"]')).not.toBeNull();

  rows()
    .find((row) => row.dataset.item === 'Color')!
    .click();
  flush();
  expect(pane().getAttribute('aria-label')).toBe('Color');
  expect(shownParts()).toBe(families.find((family) => family.id === 'Color')!.kinds.length);

  setOpen(false);
  flush();
  expect(document.querySelector('dialog[aria-label="Parts"]')).toBeNull();
  setOpen(true);
  flush();
  expect(sidebar().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('Color');
});

it("makes the catalog's categories and a category's parts two screens, opening under a way back", () => {
  const { services } = owned(createTestServices);
  const [open, setOpen] = createSignal(true);
  const kits = owned(createKits);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        open={open()}
        presets={services.presets.all}
        kits={kits}
        onLift={vi.fn()}
        onLiftKit={vi.fn()}
        onReset={vi.fn()}
        onClose={() => setOpen(false)}
        flashKit={undefined}
      />
    </LegoServicesContext>
  ));
  const sidebar = () => document.querySelector<HTMLElement>('nav[aria-label="Families of parts"]')!;
  // The split holds the side column, then the category's pane; which one a narrow dialog shows is its `data-view`.
  const split = () => sidebar().parentElement!.parentElement!;
  const pane = () => split().children[1] as HTMLElement;
  expect(split().dataset.view).toBe('list');
  expect(pane().tagName).toBe('SECTION');

  sidebar().querySelector<HTMLButtonElement>('[data-item="Color"]')!.click();
  flush();
  expect(split().dataset.view).toBe('detail');
  expect(pane().getAttribute('aria-label')).toBe('Color');
  const back = [...pane().querySelectorAll('button')].find((button) => button.textContent === 'Parts')!;
  expect(back.parentElement!.textContent).toBe('PartsColor');

  // The screen chosen stays across closing and reopening.
  setOpen(false);
  flush();
  setOpen(true);
  flush();
  expect(split().dataset.view).toBe('detail');
  [...pane().querySelectorAll('button')].find((button) => button.textContent === 'Parts')!.click();
  flush();
  expect(split().dataset.view).toBe('list');
  expect(sidebar().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('Color');
});

it('searches parts and kits across every category, clears with Escape, and marks parts already on the board', () => {
  const { services } = owned(createTestServices);
  const kits = owned(createKits);
  const close = vi.fn();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        open={true}
        presets={services.presets.all}
        kits={kits}
        onBoard={new Set(['action:undo', 'layers:list'])}
        onLift={vi.fn()}
        onLiftKit={vi.fn()}
        onReset={vi.fn()}
        onClose={close}
        flashKit={undefined}
      />
    </LegoServicesContext>
  ));

  const undoTile = document.querySelector<HTMLElement>('[title="Undo"]')!.closest('[data-on-board]');
  expect(undoTile).not.toBeNull();
  expect(undoTile!.textContent).toContain('On board');

  const input = document.querySelector<HTMLInputElement>('input[aria-label="Search parts"]')!;
  input.value = 'layer';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flush();

  const results = document.querySelector<HTMLElement>('section[aria-label="Search results"]')!;
  expect(results).not.toBeNull();
  expect(results.querySelector('[title="Layer list"]')).not.toBeNull();
  expect(results.querySelector('[title="Undo"]')).toBeNull();
  expect(results.querySelector('[title="Kit: Layers"]')).not.toBeNull();
  expect(results.querySelector('[title="Kit: OKLCH wheel"]')).toBeNull();

  input.value = 'zzzz-missing-part';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  expect(document.querySelector('section[aria-label="Search results"]')!.textContent).toContain(
    'No matching parts or kits'
  );

  // Escape clears the active search first without closing the dialog.
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flush();
  expect(input.value).toBe('');
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('section[aria-label="Tools"]')).not.toBeNull();
});

it('drops legacy workbench panels and their owned folders when loading a stored board', () => {
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({
      version: 5,
      board: {
        panels: [
          {
            id: 'tools',
            at: { x: 0.02, y: 0.1 },
            parts: [{ id: 'u1', kind: 'action:undo', cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } }]
          },
          {
            id: 'bench',
            bench: true,
            at: { x: 0, y: 0 },
            parts: [{ id: 's1', kind: 'color:swatch', cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } }]
          },
          {
            id: 's1-panel',
            owner: 's1',
            at: { x: 0, y: 0 },
            parts: [{ id: 'p1', kind: 'color:hex', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 1 } }]
          }
        ]
      }
    })
  );

  const board = owned(() => createBoard());
  expect(board.board().panels.map((panel) => panel.id)).toEqual(['tools']);
});

it('shows the brush sets as a sidebar in LEGO and as pills in Procreate, the chosen set listing its brushes', () => {
  const { services } = owned(createTestServices);
  const [brush, other] = builtInPresets;
  services.tools.preset = createSignal(other!.id)[0];
  services.presets.all = () => [brush!, other!];
  services.presets.recent = () => [brush!.id];
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:brushes" popup />
    </LegoServicesContext>
  ));
  const sets = () => document.querySelector<HTMLElement>('nav[aria-label="Brush sets"]')!;
  const brushes = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]')].map((option) => [
      option.textContent,
      option.getAttribute('aria-selected')
    ]);

  expect(sets().parentElement!.className).toMatch(/sidebar/);
  expect(sets().parentElement!.dataset.view).toBe('list');
  // The library opens on the set of the brush in use, with that brush marked.
  expect(sets().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('basic');
  expect(brushes()).toEqual([
    [brush!.name, 'false'],
    [other!.name, 'true']
  ]);

  sets().querySelector<HTMLButtonElement>('[data-item="recent"]')!.click();
  flush();
  expect(sets().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('recent');
  expect(brushes()).toEqual([[brush!.name, 'false']]);

  // Where the library is narrow, the set opens its brushes as a screen of their own, under a way back to the sets.
  const pane = sets().parentElement!.children[1] as HTMLElement;
  expect(sets().parentElement!.dataset.view).toBe('detail');
  const back = [...pane.querySelectorAll('button')].find((button) => button.textContent === 'Sets')!;
  expect(back.parentElement!.textContent).toBe('SetsRecent');
  back.click();
  flush();
  expect(sets().parentElement!.dataset.view).toBe('list');

  document.body.replaceChildren();
  mount(() => (
    <BrushLibrary
      title="Brush Library"
      presets={[brush!]}
      recent={[]}
      preset={brush!.id}
      disabled={false}
      onChoose={vi.fn()}
    />
  ));
  expect(sets().parentElement!.className).not.toMatch(/sidebar/);
  expect(sets().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('basic');
});

it("lays the File menu's commands out as Settings rows the arrow keys move through", () => {
  const { services } = owned(createTestServices);
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:file" popup onDone={vi.fn()} />
    </LegoServicesContext>
  ));
  const items = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]')];
  expect(items.map((item) => item.textContent)).toEqual([
    'Open drawing.paint, .psd',
    'Place imageNew layer',
    'Save drawing.paint',
    'Export picturePNG',
    'Export layersPSD',
    'Edit layout',
    'Options'
  ]);
  expect(items.every((item) => item.hasAttribute('data-item') && item.querySelector('svg'))).toBe(true);

  items[0]!.focus();
  items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(items[6]);
  items[6]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(items[5]);
});

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
