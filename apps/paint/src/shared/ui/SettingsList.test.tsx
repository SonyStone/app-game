// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSignal, flush, For } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import {
  SettingsBack,
  SettingsList,
  SettingsRow,
  SettingsRows,
  SettingsSplit,
  type SettingsListItem
} from './SettingsList';

let dispose: (() => void) | undefined;
const restores: (() => void)[] = [];
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  restores.splice(0).forEach((restore) => restore());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('heads each group once where it starts, marks the selected item and selects the pressed one', () => {
  const [items, setItems] = createSignal<readonly SettingsListItem[]>([
    { id: 'general', label: 'General' },
    { id: 'painting', label: 'Painting', icon: 'sliders', trailing: '32 px · 100%', group: 'basics' },
    { id: 'tip', label: 'Brush tip', group: 'basics' },
    { id: 'stroke', label: 'Stroke correction', trailing: 'Stabilizer · 6', group: 'advanced' }
  ]);
  const [selected, setSelected] = createSignal('painting');
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <SettingsList
        label="Categories"
        items={items()}
        groups={[
          { id: 'advanced', label: 'Advanced' },
          { id: 'basics', label: 'Basics' }
        ]}
        selected={selected()}
        onSelect={setSelected}
      />
    ),
    host
  );
  flush();
  const nav = host.querySelector('nav[aria-label="Categories"]')!;
  const outline = () =>
    [...nav.children]
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')
      .map((element) =>
        element.tagName === 'H3'
          ? `# ${element.textContent}`
          : `${element.getAttribute('aria-current') ? '>' : '-'} ${element.textContent}`
      );
  expect(outline()).toEqual([
    '- General',
    '# Basics',
    '> Painting32 px · 100%',
    '- Brush tip',
    '# Advanced',
    '- Stroke correctionStabilizer · 6'
  ]);
  const stroke = [...nav.querySelectorAll('button')][3]!;
  expect(stroke.getAttribute('aria-current')).toBeNull();
  expect(document.getElementById(stroke.getAttribute('aria-describedby')!)!.textContent).toBe('Stabilizer · 6');

  stroke.click();
  flush();
  expect(selected()).toBe('stroke');
  expect(stroke.getAttribute('aria-current')).toBe('page');

  // New statuses keep the rows; the row stays the same element.
  setItems((current) => current.map((item) => (item.id === 'stroke' ? { ...item, trailing: 'Off' } : item)));
  flush();
  expect([...nav.querySelectorAll('button')][3]).toBe(stroke);
  expect(stroke.textContent).toBe('Stroke correctionOff');
});

it("insets each row's icon from the row's side as far as from its top, against a host's button reset", () => {
  // jsdom applies no stylesheet, so it is read as text. The brush studio resets its buttons with
  // `.frame :where(button) { padding: 0 }`, one class, loaded after the list: the row's padding needs two to win.
  const css = readFileSync(join(__dirname, 'SettingsList.module.css'), 'utf8');
  const row = /\n\.list \.row \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  expect(row).toContain('min-height: var(--settings-list-row, 40px);');
  const tile = Number(/\.icon \{[^}]*?width: var\(--settings-list-icon-size, (\d+)px\)/.exec(css)![1]);
  const inset = Number(/\n\s*padding: 0 .+ 0 var\(--settings-list-row-start, (\d+)px\);/.exec(row)![1]);
  expect(inset).toBe((40 - tile) / 2);
  // The list's pill draws the selected row's ground: the row itself changes only its text color.
  const selected = /&\[data-selected\] \{([^&}]*)/.exec(row)?.[1];
  expect(selected).toContain('color');
  expect(selected).not.toMatch(/padding|margin|grid|background/);
});

it('lays the accent pill under the selected row and slides it to the next one chosen, scrolling it into view', () => {
  stubLayout();
  const scrolled: string[] = [];
  // jsdom has no scrolling: the rows record what asks to be brought into view.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: HTMLElement) {
      scrolled.push(this.dataset.item ?? '');
    }
  });
  restores.push(() => Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'));
  const { nav, select } = mountList('painting');
  const pill = nav.firstElementChild as HTMLElement;
  expect(pill.getAttribute('aria-hidden')).toBe('true');
  // "Painting" is the second row, after a group heading; "Stroke correction" the fourth, after another.
  expect([pill.style.transform, pill.style.width, pill.style.height]).toEqual([
    'translate(8px, 62px)',
    '292px',
    '40px'
  ]);
  expect(pill.style.visibility).toBe('');
  // Placed at once the first time: the transition is back for the next move.
  expect(pill.style.transition).toBe('');
  expect(scrolled).toEqual([]);

  select('stroke');
  expect(pill.style.transform).toBe('translate(8px, 166px)');
  expect(pill.style.transition).toBe('');
  expect(scrolled).toEqual(['stroke']);
});

it('hides the pill while no row is selected', () => {
  stubLayout();
  const [selected, setSelected] = createSignal<string | undefined>(undefined);
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <SettingsList
        label="Categories"
        items={[{ id: 'general', label: 'General' }]}
        selected={selected()}
        onSelect={setSelected}
      />
    ),
    host
  );
  flush();
  const pill = host.querySelector('nav')!.firstElementChild as HTMLElement;
  expect(pill.style.visibility).toBe('hidden');
  setSelected('general');
  flush();
  expect(pill.style.visibility).toBe('');
  expect(pill.style.transform).toBe('translate(8px, 0px)');
});

it("slides the pill on the 200 ms timing, at once with reduced motion, and fills a plain list's selected row", () => {
  // jsdom applies no stylesheet, so it is read as text.
  const css = readFileSync(join(__dirname, 'SettingsList.module.css'), 'utf8');
  expect(css).toContain('--settings-list-travel: 200ms cubic-bezier(0.3, 0, 0, 1);');
  const pill = /\n\.pill \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  expect(pill).toContain('background: var(--settings-list-selected, #3d7eff);');
  expect(pill).toContain('transform var(--settings-list-travel)');
  expect(pill).toMatch(/prefers-reduced-motion: reduce\) \{\s*transition: none;/);
  expect(css).toMatch(
    /\.plain \.row\[data-selected\]::before \{\s*background: var\(--settings-list-selected, #3d7eff\);/
  );
  // The selected row's text is white on the pill by default.
  expect(css).toContain('color: var(--settings-list-selected-ink, #ffffff);');
});

it('shows a press at once, before the selection lands', () => {
  stubLayout();
  const { nav, selected } = mountList('painting');
  const tip = rowNamed(nav, 'Brush tip');
  tip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'pen' }));
  flush();
  expect(tip.hasAttribute('data-pressed')).toBe(true);
  expect(selected()).toBe('painting');

  tip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'pen' }));
  tip.click();
  flush();
  expect(tip.hasAttribute('data-pressed')).toBe(false);
  expect(selected()).toBe('tip');
});

it('moves the focus with the arrow keys, Home and End; the focused row selects as a button', () => {
  stubLayout();
  const { nav, selected } = mountList('painting');
  const rows = [...nav.querySelectorAll<HTMLButtonElement>('button')];
  const key = (name: string) =>
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  rows[1]!.focus();
  expect(key('ArrowDown')).toBe(false);
  expect(document.activeElement).toBe(rows[2]);
  key('ArrowUp');
  key('ArrowUp');
  expect(document.activeElement).toBe(rows[0]);
  key('ArrowUp');
  expect(document.activeElement).toBe(rows[0]);
  key('End');
  expect(document.activeElement).toBe(rows[3]);
  key('Home');
  expect(document.activeElement).toBe(rows[0]);
  // Other keys pass through: Enter and Space press the focused button.
  expect(key('Enter')).toBe(true);
  rows[0]!.click();
  flush();
  expect(selected()).toBe('general');
});

it('lays the same row out in a plain list: options marked selected, menu items without a selection', () => {
  const [mode, setMode] = createSignal('screen');
  const run = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <>
        <SettingsList
          label="Sidebar"
          items={[{ id: 'general', label: 'General' }]}
          selected="general"
          onSelect={vi.fn()}
        />
        <SettingsRows role="listbox" label="Modes">
          <For each={['normal', 'screen']}>
            {(id) => (
              <SettingsRow
                id={id}
                role="option"
                label={id}
                tile={<canvas data-tile={id} />}
                selected={mode() === id}
                onSelect={() => setMode(id)}
              />
            )}
          </For>
        </SettingsRows>
        <SettingsRows role="menu" label="File">
          <SettingsRow id="open" role="menuitem" icon="paper" label="Open" trailing=".paint" onSelect={run} />
          <SettingsRow id="save" role="menuitem" icon="check" label="Save" disabled onSelect={run} />
          <SettingsRow id="export" role="menuitem" icon="layers" label="Export" onSelect={run} />
        </SettingsRows>
      </>
    ),
    host
  );
  flush();
  const sidebarRow = host.querySelector<HTMLElement>('nav [data-item="general"]')!;
  const options = [...host.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]')];
  const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]')];

  // One row: the plain lists' rows carry the sidebar's own row class, and their containers its list class.
  expect(options.every((row) => row.className === sidebarRow.className)).toBe(true);
  expect(items.every((row) => row.className === sidebarRow.className)).toBe(true);
  expect(host.querySelector('[role="menu"]')!.className).toContain(host.querySelector('nav')!.className);

  expect(options.map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  expect(options[1]!.hasAttribute('data-selected')).toBe(true);
  expect(options[1]!.getAttribute('aria-current')).toBeNull();
  expect(options[0]!.querySelector('[data-tile="normal"]')).not.toBeNull();
  options[0]!.click();
  flush();
  expect(mode()).toBe('normal');
  expect(options.map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false']);

  expect(items.map((row) => [row.getAttribute('aria-selected'), row.getAttribute('aria-current')])).toEqual([
    [null, null],
    [null, null],
    [null, null]
  ]);
  expect(document.getElementById(items[0]!.getAttribute('aria-describedby')!)!.textContent).toBe('.paint');

  // The arrow keys pass over a disabled command.
  items[0]!.focus();
  items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(items[2]);
  items[2]!.click();
  expect(run).toHaveBeenCalledOnce();
});

it('puts a list beside its detail, and names which of the two shows where they are two screens', () => {
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <SettingsSplit
        view={view()}
        list={
          <SettingsList
            label="Families"
            items={[{ id: 'color', label: 'Color' }]}
            selected="color"
            onSelect={() => setView('detail')}
          />
        }
      >
        <section aria-label="Color">
          <SettingsBack label="Families" title="Color" onBack={() => setView('list')} />
        </section>
      </SettingsSplit>
    ),
    host
  );
  flush();
  const split = host.firstElementChild as HTMLElement;
  expect([...split.children].map((child) => child.tagName)).toEqual(['NAV', 'SECTION']);
  expect(split.dataset.view).toBe('list');

  split.querySelector<HTMLButtonElement>('[data-item="color"]')!.click();
  flush();
  expect(split.dataset.view).toBe('detail');
  const back = split.querySelector('section button')!;
  expect([back.textContent, back.nextElementSibling!.textContent]).toEqual(['Families', 'Color']);
  (back as HTMLButtonElement).click();
  flush();
  expect(split.dataset.view).toBe('list');
});

it("turns a split into two screens by the host's container query on its own width", () => {
  // jsdom applies no stylesheet or container query, so the rules are read as text; the browser check measures them.
  const css = readFileSync(join(__dirname, 'SettingsList.module.css'), 'utf8');
  const narrow = /@container style\(--settings-split: narrow\) \{([\s\S]*)\n\}/.exec(css)?.[1] ?? '';
  expect(narrow).toMatch(
    /\.split\[data-view='list'\] > :nth-child\(2\),\s*\.split\[data-view='detail'\] > :first-child \{\s*display: none;/
  );
  expect(narrow).toMatch(/\.split \.list \{\s*--settings-list-chevron: block;/);
  expect(narrow).toMatch(/\.split \.pill \{\s*display: none;/);
  expect(narrow).toMatch(/\.split \.backBar \{\s*display: grid;/);
  // Outside the query the back bar is hidden and both sides show.
  expect(css).toMatch(/\n\.backBar \{\s*display: none;/);

  // Each host sets the switch from the width of its own box, not the window's.
  const lego = readFileSync(join(__dirname, '../../variants/lego/LegoStudio.module.css'), 'utf8');
  expect(lego).toMatch(/container: box-shelves \/ inline-size;/);
  expect(lego).toMatch(/@container box-shelves \(width < 380px\) \{\s*\.trayBody \{\s*--settings-split: narrow;/);
  expect(lego).toMatch(/container: brush-library \/ inline-size;/);
  expect(lego).toMatch(
    /@container brush-library \(width < 400px\) \{\s*\.brushesCard > \* \{\s*--settings-split: narrow;/
  );
  const studio = readFileSync(join(__dirname, '../../features/brush-editor/BrushEditor.module.css'), 'utf8');
  expect(studio).toMatch(/@container brush-studio \(width < 520px\) \{\s*\.studioSheet \{\s*--settings-split: narrow;/);
  expect(studio).toMatch(
    /@container brush-studio \(orientation: landscape\) and \(700px <= width < 1000px\) \{\s*\.studioSheet \{\s*--settings-split: narrow;/
  );
  for (const sheet of [css, lego, studio]) {
    expect(sheet).not.toMatch(/@media[^{]*width/);
  }
});

/** Renders four rows, the second and third under "Basics" and the fourth under "Advanced", with `selected` chosen. */
function mountList(initial: string) {
  const [selected, setSelected] = createSignal(initial);
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <SettingsList
        label="Categories"
        items={[
          { id: 'general', label: 'General' },
          { id: 'painting', label: 'Painting', group: 'basics' },
          { id: 'tip', label: 'Brush tip', group: 'basics' },
          { id: 'stroke', label: 'Stroke correction', group: 'advanced' }
        ]}
        groups={[
          { id: 'basics', label: 'Basics' },
          { id: 'advanced', label: 'Advanced' }
        ]}
        selected={selected()}
        onSelect={setSelected}
      />
    ),
    host
  );
  flush();
  const nav = host.querySelector('nav')!;

  return {
    nav,
    selected,
    select: (id: string) => {
      rowNamed(
        nav,
        { general: 'General', painting: 'Painting', tip: 'Brush tip', stroke: 'Stroke correction' }[id]!
      ).click();
      flush();
    }
  };
}

function rowNamed(nav: HTMLElement, label: string) {
  return [...nav.querySelectorAll<HTMLElement>('button')].find((row) => row.textContent?.startsWith(label))!;
}

/**
 * Lays the list out as a browser would, which jsdom does not: 40 px rows 2 px apart from x 8 to 300, a 20 px heading
 * before each group, and content 400 px tall.
 */
function stubLayout() {
  const box = (element: HTMLElement) => {
    let top = 0;
    for (const child of element.parentElement?.children ?? []) {
      if (child === element) {
        break;
      }

      top += child.tagName === 'H3' ? 20 : child.tagName === 'BUTTON' ? 42 : 0;
    }

    return element.tagName === 'BUTTON'
      ? { top, height: 40, left: 8, width: 292 }
      : { top: 0, height: 400, left: 0, width: 300 };
  };
  const define = (name: string, read: (element: HTMLElement) => number) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return read(this);
      }
    });
    restores.push(() =>
      original
        ? Object.defineProperty(HTMLElement.prototype, name, original)
        : Reflect.deleteProperty(HTMLElement.prototype, name)
    );
  };
  define('offsetTop', (element) => box(element).top);
  define('offsetHeight', (element) => box(element).height);
  define('offsetLeft', (element) => box(element).left);
  define('offsetWidth', (element) => box(element).width);
  define('scrollHeight', () => 400);
}
