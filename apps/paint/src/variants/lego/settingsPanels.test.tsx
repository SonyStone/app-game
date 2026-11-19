// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { BrushLibrary } from '../procreate/BrushLibrary';
import { createSheet } from './createSheet';
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

it("chooses the box's family in a sidebar, shows only its parts, and keeps the choice while the box closes", () => {
  const { services } = owned(createTestServices);
  const sheet = owned(() => createSheet(() => 768));
  const kits = owned(createKits);
  sheet.to('middle');
  flush();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        presets={services.presets.all}
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
  const families = partFamilies(services.presets.all);
  const sidebar = () => document.querySelector<HTMLElement>('nav[aria-label="Families of parts"]')!;
  const rows = () => [...sidebar().querySelectorAll<HTMLButtonElement>('[data-item]')];
  const pane = () => document.querySelector<HTMLElement>('[aria-label="Box of parts"] section')!;
  const shownParts = () => pane().querySelectorAll('[title]').length;

  expect(rows().map((row) => [row.dataset.item, row.textContent])).toEqual(
    families.map((family) => [family.id, `${family.title}${family.kinds.length}`])
  );
  // The chosen family lies on the list's one sliding pill; nothing joins it to the parts.
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
    .find((row) => row.dataset.item === 'Color')!
    .click();
  flush();
  expect(pane().getAttribute('aria-label')).toBe('Color');
  expect(shownParts()).toBe(families.find((family) => family.id === 'Color')!.kinds.length);

  sheet.to('closed');
  flush();
  expect(document.querySelector('nav[aria-label="Families of parts"]')).toBeNull();
  sheet.to('middle');
  flush();
  expect(sidebar().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('Color');
});

it("makes the box's families and a family's parts two screens, a family opening its parts under a way back", () => {
  const { services } = owned(createTestServices);
  const sheet = owned(() => createSheet(() => 768));
  const kits = owned(createKits);
  sheet.to('middle');
  flush();
  mount(() => (
    <LegoServicesContext value={services}>
      <PartsTray
        presets={services.presets.all}
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
  const sidebar = () => document.querySelector<HTMLElement>('nav[aria-label="Families of parts"]')!;
  // The split holds the list, then the family's parts; which one a narrow box shows is its `data-view`.
  const split = () => sidebar().parentElement!;
  const pane = () => split().children[1] as HTMLElement;
  expect(split().dataset.view).toBe('list');
  expect(pane().tagName).toBe('SECTION');

  sidebar().querySelector<HTMLButtonElement>('[data-item="Color"]')!.click();
  flush();
  expect(split().dataset.view).toBe('detail');
  expect(pane().getAttribute('aria-label')).toBe('Color');
  const back = [...pane().querySelectorAll('button')].find((button) => button.textContent === 'Families')!;
  expect(back.parentElement!.textContent).toBe('FamiliesColor');

  // The screen chosen stays while the box closes and opens.
  sheet.to('closed');
  flush();
  sheet.to('middle');
  flush();
  expect(split().dataset.view).toBe('detail');
  [...pane().querySelectorAll('button')].find((button) => button.textContent === 'Families')!.click();
  flush();
  expect(split().dataset.view).toBe('list');
  expect(sidebar().querySelector('[aria-current="page"]')!.getAttribute('data-item')).toBe('Color');
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
    'Export layersPSD'
  ]);
  expect(items.every((item) => item.hasAttribute('data-item') && item.querySelector('svg'))).toBe(true);

  items[0]!.focus();
  items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(items[4]);
  items[4]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(items[3]);
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
