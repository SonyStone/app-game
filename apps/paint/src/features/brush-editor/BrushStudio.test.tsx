// @vitest-environment jsdom
import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { abrCategories } from './abrSchema';
import { BrushEditor } from './BrushEditor';
import { BrushStudio } from './BrushStudio';
import { snapshotBrushSettings, type BrushCategory } from './schema';

let disposers: (() => void)[] = [];
afterEach(() => {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  document.body.replaceChildren();
});

it('shows the same categories, statuses and rows as the panel for a Paint brush', () => {
  const panel = mount('panel', defaultBrush());
  const studio = mount('studio', defaultBrush());
  expect(studio.categories()).toEqual(panel.categories());
  expect(studio.categories()).toContain('Stroke correction');
  expect(studio.contents('Painting')).toEqual(expect.arrayContaining(['slider | Size | 32 | false']));
  for (const name of panel.categories()) {
    expect(studio.contents(name)).toEqual(panel.contents(name));
  }
});

it('shows the same categories, sections and rows as the panel for an ABR brush', () => {
  const source = { id: 'test', name: 'Test', preset: { tip: { kind: 'computed', diameter: 30 } }, resources: [] };
  const values = brushToFormValues(source as unknown as BrushAsset);
  const abr: Brush = {
    ...defaultBrush(),
    engine: { id: 'abr', settings: { values: { ...values, useTransfer: true }, tipId: 'tip' } }
  };
  const panel = mount('panel', abr, abrCategories);
  const studio = mount('studio', abr, abrCategories);
  expect(studio.categories()).toEqual(panel.categories());
  expect(studio.categories()).toContain('Transfer');
  for (const name of panel.categories()) {
    expect(studio.contents(name)).toEqual(panel.contents(name));
  }

  // Greyed rows stay greyed, sections keep their headings.
  expect(studio.contents('Transfer')).toContain('h3 Opacity');
});

it('gives each number row a value pill that types, beside its label, over a slider', () => {
  const studio = mount('studio', defaultBrush());
  const size = studio.root().querySelector<HTMLElement>('[role="slider"]')!;
  const row = size.parentElement!;
  expect(row.getAttribute('data-kind')).toBe('number');
  const field = row.querySelector<HTMLInputElement>('input[role="spinbutton"]')!;
  expect(field.getAttribute('aria-label')).toBe('Size');
  field.value = '120';
  field.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(studio.brush().size).toBe(120);
});

it('discards the changes and closes on Cancel, keeps them and closes on Done', () => {
  const onDone = vi.fn();
  const studio = mount('studio', defaultBrush(), undefined, onDone);
  studio.click(studio.button('Done'));
  expect(onDone).toHaveBeenCalledOnce();
  expect(studio.changes).toHaveLength(0);

  const field = studio.root().querySelector<HTMLInputElement>('input[aria-label="Flow"]')!;
  field.value = '40';
  field.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(studio.brush().flow).toBeCloseTo(0.4);
  studio.click(studio.button('Done'));
  expect(studio.brush().flow).toBeCloseTo(0.4);
  expect(onDone).toHaveBeenCalledTimes(2);

  studio.click(studio.button('Cancel'));
  expect(studio.brush().flow).toBe(defaultBrush().flow);
  expect(onDone).toHaveBeenCalledTimes(3);

  // Nothing to discard: Cancel only closes.
  const sent = studio.changes.length;
  studio.click(studio.button('Cancel'));
  expect(studio.changes).toHaveLength(sent);
  expect(onDone).toHaveBeenCalledTimes(4);
});

it('names the edited brush as its title and shows the pad it is given', () => {
  const studio = mount('studio', defaultBrush(), undefined, () => {}, 'Soft round');
  expect(studio.root().querySelector('h1')!.textContent).toBe('Soft round');
  expect(studio.root().querySelector('[role="region"][aria-label="Drawing pad"] [data-pad]')).not.toBeNull();
});

it('switches between the categories, a category and the pad in the narrow layout', () => {
  const studio = mount('studio', defaultBrush());
  const frame = studio.root().firstElementChild!;
  expect(frame.getAttribute('data-view')).toBe('list');
  studio.click(studio.category('Dynamics'));
  expect(frame.getAttribute('data-view')).toBe('detail');
  studio.click(studio.button('Pad'));
  expect(frame.getAttribute('data-view')).toBe('pad');
  studio.click(studio.button('Pad'));
  expect(frame.getAttribute('data-view')).toBe('list');
  studio.click(studio.category('Dynamics'));
  studio.click(studio.button('All categories'));
  expect(frame.getAttribute('data-view')).toBe('list');
});

it("puts the host's rows in place of number rows, and keeps its own where the host gives none", () => {
  const asked: string[] = [];
  const studio = mount(
    'studio',
    defaultBrush(),
    undefined,
    () => {},
    undefined,
    (setting, category) => {
      asked.push(`${category.id}:${setting.id}`);
      return setting.id === 'flow' ? undefined : <div data-hosted={setting.id} />;
    }
  );
  studio.click(studio.category('Painting'));
  expect(asked).toEqual(['painting:size', 'painting:opacity', 'painting:flow']);
  const rows = studio.root().querySelector('section[aria-labelledby] > div')!;
  expect([...rows.children].map((row) => row.getAttribute('data-hosted') ?? row.getAttribute('data-kind'))).toEqual([
    'size',
    'opacity',
    'number',
    null
  ]);
  expect(rows.lastElementChild!.getAttribute('role')).toBe('radiogroup');
  studio.click(studio.category('Stroke correction'));
  expect(asked.at(-1)).toBe('stroke-correction:smoothing');
  expect(studio.root().querySelector('[data-hosted="smoothing"]')).not.toBeNull();
  // The host's rows edit the brush themselves; the studio sends no patch for them.
  expect(studio.changes).toEqual([]);
});

it("offers the brush no pressure curve of its own, a Paint brush's or an ABR preset's", () => {
  const source = { id: 'test', name: 'Test', preset: { tip: { kind: 'computed', diameter: 30 } }, resources: [] };
  const values = brushToFormValues(source as unknown as BrushAsset);
  const abr: Brush = { ...defaultBrush(), engine: { id: 'abr', settings: { values, tipId: 'tip' } } };
  for (const [brush, categories] of [
    [defaultBrush(), undefined],
    [abr, abrCategories]
  ] as const) {
    const studio = mount('studio', brush, categories);
    expect(studio.categories().join()).not.toMatch(/pressure curve/i);
    expect(studio.root().querySelector('[data-pen-pane]')).toBeNull();
  }
});

it("ends the sidebar with the pen's page, apart from the brush, and has Cancel restore it before leaving", () => {
  const steps: string[] = [];
  const studio = mount('studio', defaultBrush(), undefined, () => steps.push('done'), undefined, undefined, {
    status: '4 points',
    onCancel: () => steps.push('cancel')
  });
  const headings = [...studio.root().querySelectorAll('nav h3')].map((heading) => heading.textContent);
  expect(headings.at(-1)).toBe('Pen');
  expect(studio.categories().at(-1)).toBe('Pressure');
  expect(studio.category('Pressure').textContent).toContain('4 points');

  studio.click(studio.category('Pressure'));
  const pane = studio.root().querySelector('[data-pen-pane]')!;
  expect(pane.querySelector('h2')!.textContent).toBe('Pen pressure');
  expect(pane.querySelector('[data-pen-host]')).not.toBeNull();
  expect(studio.category('Pressure').getAttribute('aria-current')).toBe('page');
  expect(studio.category('Painting').getAttribute('aria-current')).toBeNull();

  studio.click(studio.category('Painting'));
  expect(studio.root().querySelector('[data-pen-pane]')).toBeNull();
  studio.click(studio.button('Done'));
  expect(steps).toEqual(['done']);
  studio.click(studio.button('Cancel'));
  expect(steps).toEqual(['done', 'cancel', 'done']);
});

/**
 * Renders the panel or the studio over a brush kept by a controlled parent, inside a host element of its own, and
 * reads it as the tests compare it.
 */
function mount(
  kind: 'panel' | 'studio',
  initial: Brush,
  categories?: readonly BrushCategory[],
  onDone: () => void = () => {},
  name?: string,
  hostRow?: Parameters<typeof BrushStudio>[0]['hostRow'],
  pen?: { status: string; onCancel: () => void }
) {
  const [brush, setBrush] = createSignal(initial);
  const baseline = snapshotBrushSettings(initial);
  const changes: Partial<Brush>[] = [];
  const onChange = (patch: Partial<Brush>) => {
    changes.push(patch);
    setBrush((current) => ({ ...current, ...patch }));
  };
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () =>
        kind === 'panel' ? (
          <BrushEditor
            brush={brush()}
            baseline={baseline}
            categories={categories}
            onChange={onChange}
            onDone={onDone}
          />
        ) : (
          <BrushStudio
            brush={brush()}
            baseline={baseline}
            categories={categories}
            name={name}
            hostRow={hostRow}
            onChange={onChange}
            onDone={onDone}
            onCancel={pen?.onCancel}
            penStatus={pen?.status}
            penPane={<div data-pen-host />}
            pad={<div data-pad />}
          />
        ),
      host
    )
  );
  flush();
  const root = () => host.firstElementChild as HTMLElement;
  const label = (element: Element) =>
    element.getAttribute('aria-label') ??
    (element.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const buttons = () => [...root().querySelectorAll<HTMLElement>('nav button')];
  const category = (text: string) =>
    buttons().find((button) => button.querySelector('span span')!.textContent === text)!;
  const click = (element: Element) => {
    (element as HTMLElement).click();
    flush();
  };

  return {
    root,
    brush,
    changes,
    click,
    category,
    button: (text: string) =>
      [...root().querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === text)!,
    /** Each category's name and status line. */
    categories: () => buttons().map((button) => button.querySelector('span span')!.textContent!),
    /** The category's heading, status, About and every control and section heading, with its state, in order. */
    contents(name: string) {
      click(category(name));
      const pane = root().querySelector('section[aria-labelledby]')!;
      return [
        `status ${category(name).textContent}`,
        ...[
          ...pane.querySelectorAll(
            'h2, h3, [aria-expanded], [role="slider"], [role="spinbutton"], output, [role="switch"], [role="radio"], [aria-haspopup="listbox"], p'
          )
        ].map((element) =>
          element.matches('h2, h3, p, [aria-expanded]:not([aria-haspopup])')
            ? `${element.tagName.toLowerCase()} ${element.textContent}`
            : [
                element.getAttribute('role') ?? element.tagName.toLowerCase(),
                label(element),
                element.getAttribute('aria-valuenow') ?? element.getAttribute('aria-checked') ?? element.textContent,
                element.getAttribute('aria-disabled') ?? String((element as HTMLButtonElement).disabled ?? '')
              ].join(' | ')
        )
      ];
    }
  };
}
