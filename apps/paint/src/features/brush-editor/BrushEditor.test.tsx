// @vitest-environment jsdom
import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { brushSizeCurve, curveValue } from '@app-game/abr-brush/sliderCurves';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { BrushEditor } from './BrushEditor';
import { abrCategories, abrValues } from './abrSchema';
import { snapshotBrushSettings, type BrushCategory, type BrushSettingsSnapshot } from './schema';

/** A computed-tip ABR preset whose engine values the ABR tests edit. */
const abrSource = {
  id: 'test',
  name: 'Test',
  preset: { tip: { kind: 'computed', diameter: 30 } },
  resources: []
} as unknown as BrushAsset;

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('moves a slider to the press at once and keeps dragging off the row, along the size curve', () => {
  const { brush, slider, pointer } = mount();
  pointer(slider('Opacity'), 'pointerdown', 200);
  // The rail spans x 100 to 300, so the middle of 1–100 %.
  expect(brush().opacity).toBeCloseTo(0.51);
  pointer(slider('Opacity'), 'pointermove', 1000, 400);
  expect(brush().opacity).toBe(1);
  pointer(slider('Opacity'), 'pointermove', -500, -300);
  expect(brush().opacity).toBeCloseTo(0.01);
  pointer(slider('Opacity'), 'pointerup', -500, -300);

  pointer(slider('Size'), 'pointerdown', 200);
  expect(brush().size).toBe(Math.round(curveValue(brushSizeCurve(512), 0.5)));
  expect(slider('Size').getAttribute('aria-valuetext')).toBe(`${brush().size} px`);
});

it('takes a slider press for itself, while a press on a label or empty space is left to scroll and changes nothing', () => {
  const { brush, slider, pointer, editor } = mount();
  const before = brush();
  const press = pointer(slider('Flow'), 'pointerdown', 150);
  expect(press.defaultPrevented).toBe(true);
  pointer(slider('Flow'), 'pointerup', 150);

  const changed = brush();
  const label = [...editor().querySelectorAll('span')].find((span) => span.textContent === 'Flow')!;
  for (const target of [label, editor().querySelector('section[aria-labelledby]')!]) {
    expect(pointer(target, 'pointerdown', 150).defaultPrevented).toBe(false);
    pointer(target, 'pointermove', 280, 60);
    pointer(target, 'pointerup', 280, 60);
  }

  expect(changed).not.toBe(before);
  expect(brush()).toBe(changed);
});

it('steps a slider with the keys', () => {
  const { brush, slider } = mount();
  slider('Size').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flush();
  expect(brush().size).toBe(33);
  slider('Size').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  flush();
  expect(brush().size).toBe(512);
});

it('takes the whole row of a switch, a choice option and a category as its press target', () => {
  const { brush, editor, category, status, click } = mount({
    ...defaultBrush(),
    stroke: { ...defaultBrush().stroke, mode: 'stabilizer', stabilizer: 4 }
  });
  click(status('Painting'));
  const radio = [...editor().querySelectorAll('[role="radio"]')].find((element) =>
    element.textContent?.includes('Classic')
  )!;
  click(radio.lastElementChild!);
  expect(brush().mixing).toBe('classic');
  expect(radio.getAttribute('aria-checked')).toBe('true');

  click(status('Stroke correction'));
  expect(category('Stroke correction').getAttribute('aria-current')).toBe('true');
  const toggle = editor().querySelector<HTMLElement>('[role="switch"]')!;
  const on = brush().stroke.catchUp;
  click(toggle.lastElementChild!);
  expect(brush().stroke.catchUp).toBe(!on);
  expect(toggle.getAttribute('aria-checked')).toBe(String(!on));
});

it('shows a greyed row with its value, announces it disabled and ignores presses', () => {
  const { brush, editor, category, click, slider } = mount();
  click(category('Stroke correction'));
  // At Smoothing 0 nothing trails, so catch-up does not apply.
  expect(slider('Smoothing').getAttribute('aria-disabled')).toBe('false');
  expect(slider('Smoothing').getAttribute('aria-valuenow')).toBe('0');
  const catchUp = editor().querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(catchUp.disabled).toBe(true);
  const before = brush();
  catchUp.click();
  flush();
  expect(brush()).toBe(before);
});

it('keeps every row in place while a slider drags and after a switch or a choice changes', () => {
  const { brush, editor, category, click, slider, pointer } = mount();
  const rows = () => [...editor().querySelectorAll('section[aria-labelledby] > div:last-child > *')];

  const painting = rows();
  pointer(slider('Size'), 'pointerdown', 120);
  pointer(slider('Size'), 'pointermove', 290);
  expect(rows()).toEqual(painting);
  pointer(slider('Size'), 'pointerup', 290);

  click(category('Dynamics'));
  const pressure = rows();
  for (const toggle of editor().querySelectorAll<HTMLElement>('[role="switch"]')) {
    click(toggle);
  }

  expect(rows()).toEqual(pressure);

  // Smoothing from Studio to the stabilizer and back changes the mode, and no row comes or goes.
  click(category('Stroke correction'));
  const correction = rows();
  for (const x of [200, 300, 100]) {
    pointer(slider('Smoothing'), 'pointerdown', x);
    pointer(slider('Smoothing'), 'pointerup', x);
    expect(rows()).toEqual(correction);
  }
  expect(brush().stroke.mode).toBe('studio');
});

it('shows a choice of more than three options as one row that opens them, and closes it on a choice, outside or Escape', () => {
  const values = brushToFormValues(abrSource);
  const abr: Brush = {
    ...defaultBrush(),
    engine: { id: 'abr', settings: { values: { ...values, useTransfer: true }, tipId: 'tip' } }
  };
  const { brush, editor, category, click, menu, pointer } = mount(abr, { categories: abrCategories });
  click(category('Transfer'));
  expect(editor().querySelectorAll('[role="radio"]')).toHaveLength(0);
  const button = menu('Flow Control');
  expect(button.getAttribute('aria-haspopup')).toBe('listbox');
  expect(button.textContent).toBe('Off');
  const list = () => editor().querySelector('[role="listbox"]');
  expect(list()).toBeNull();

  click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(list()!.querySelectorAll('[role="option"]').length).toBeGreaterThan(3);
  expect(list()!.querySelector('[aria-selected="true"]')!.textContent).toBe('Off');
  expect(document.activeElement).toBe(list()!.querySelector('[aria-selected="true"]'));

  // Escape closes the list without a change and gives the focus back to the row's button.
  const before = brush();
  list()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flush();
  expect(list()).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(brush()).toBe(before);

  // A press outside the list closes it without a change; a press on the button itself does not count as outside.
  click(button);
  pointer(button, 'pointerdown', 0);
  expect(list()).not.toBeNull();
  pointer(editor().querySelector('h2')!, 'pointerdown', 0);
  expect(list()).toBeNull();
  expect(brush()).toBe(before);

  // The button toggles the list.
  click(button);
  click(button);
  expect(list()).toBeNull();
});

it('keeps a choice of up to three options as a list in place', () => {
  const { editor } = mount();
  expect([...editor().querySelectorAll('[role="radio"]')].map((radio) => radio.textContent)).toEqual([
    'Smooth color',
    'Classic'
  ]);
  expect(editor().querySelector('[aria-haspopup]')).toBeNull();
});

it('greys an ABR row while its control gives it no effect, ignores presses on it, and enables it once chosen', () => {
  const values = brushToFormValues(abrSource);
  const abr: Brush = {
    ...defaultBrush(),
    engine: { id: 'abr', settings: { values: { ...values, useTransfer: true }, tipId: 'tip' } }
  };
  const { brush, editor, category, click, menu, slider, pointer } = mount(abr, { categories: abrCategories });
  click(category('Transfer'));
  expect(
    [...editor().querySelectorAll('[role="group"]')].map((group) => [
      group.querySelector('h3')!.textContent,
      // A label shows its short name; assistive technology hears the section's name before it.
      [...group.querySelectorAll('[aria-labelledby]')]
        .flatMap((control) => control.getAttribute('aria-labelledby')!.split(' ').slice(0, 1))
        .map((id) => document.getElementById(id)!.textContent)
        .filter((text, i, all) => all.indexOf(text) === i)
    ])
  ).toEqual(
    ['Opacity', 'Flow'].map((name) => [
      name,
      ['Jitter', 'Control', 'Minimum', 'Fade length'].map((label) => `${name} ${label}`)
    ])
  );
  const labels = [...editor().querySelectorAll('[role="group"] [aria-labelledby]')].map((control) =>
    document.getElementById(control.getAttribute('aria-labelledby')!.split(' ')[0]!)!
  );
  const shown = [...new Set(labels)].map((label) =>
    [...label.childNodes]
      .filter((node) => !(node instanceof HTMLElement))
      .map((node) => node.textContent)
      .join('')
  );
  expect(shown.slice(0, 4)).toEqual(['Jitter', 'Control', 'Minimum', 'Fade length']);

  const minimum = slider('Flow Minimum');
  expect(minimum.getAttribute('aria-disabled')).toBe('true');
  const before = brush();
  pointer(minimum, 'pointerdown', 250);
  pointer(minimum, 'pointerup', 250);
  expect(brush()).toBe(before);

  click(menu('Flow Control'));
  click([...editor().querySelectorAll('[role="option"]')].find((option) => option.textContent === 'Pen pressure')!);
  expect(abrValues(brush()).transfer.flowControl).toBe(2);
  expect(minimum.getAttribute('aria-disabled')).toBe('false');
  expect(slider('Flow Fade length').getAttribute('aria-disabled')).toBe('true');
  pointer(minimum, 'pointerdown', 250);
  pointer(minimum, 'pointerup', 250);
  expect(abrValues(brush()).transfer.flowMinimum).toBe(75);
  expect(category('Transfer').textContent).toContain('Pressure');
});

it('gives every ABR category its own icon and keeps its name for assistive technology', () => {
  const values = brushToFormValues(abrSource);
  const abr: Brush = { ...defaultBrush(), engine: { id: 'abr', settings: { values, tipId: 'tip' } } };
  const { editor, categories } = mount(abr, { categories: abrCategories });
  const buttons = [...editor().querySelectorAll<HTMLElement>('nav button')];
  expect(categories()).toContain('Color dynamics');
  const icons = buttons.map((button) => button.querySelector('svg path')!.getAttribute('d'));
  expect(new Set(icons).size).toBe(icons.length);
  for (const button of buttons) {
    expect(document.getElementById(button.getAttribute('aria-labelledby')!)!.textContent).toBeTruthy();
  }
});

it('marks the chosen category as selected and tells whether one is on by its status alone', () => {
  const { editor, category, click } = mount();
  expect(category('Painting').getAttribute('aria-current')).toBe('true');
  expect(category('Dynamics').getAttribute('aria-current')).toBeNull();
  expect(category('Dynamics').hasAttribute('aria-checked')).toBe(false);
  expect(category('Dynamics').textContent).toContain('Pressure → Size');

  click(category('Dynamics'));
  for (const toggle of editor().querySelectorAll<HTMLElement>('[role="switch"][aria-checked="true"]')) {
    click(toggle);
  }

  expect(category('Dynamics').textContent).toContain('Off');
  expect(category('Dynamics').getAttribute('aria-current')).toBe('true');
  expect(category('Painting').getAttribute('aria-current')).toBeNull();
});

it('depends on no hover', () => {
  // jsdom does not apply the stylesheet, so it is read as text.
  const css = readFileSync(join(__dirname, 'BrushEditor.module.css'), 'utf8');
  expect(css).toContain('.slider');
  expect(css).not.toContain(':hover');
});

it('leaves out a category with no rows for the brush, as Brush tip for an ABR preset', () => {
  const { categories } = mount({ ...defaultBrush(), engine: { id: 'abr', settings: {} } });
  expect(categories()).toEqual(['Painting', 'Stroke correction']);
});

it('shows no explanatory text in a category: only its title, status, headings, labels and values', () => {
  const values = brushToFormValues(abrSource);
  const abr: Brush = { ...defaultBrush(), engine: { id: 'abr', settings: { values, tipId: 'tip' } } };
  for (const [brush, categories] of [
    [defaultBrush(), undefined],
    [abr, abrCategories]
  ] as const) {
    const { editor, click, categories: names, category } = mount(brush, { categories });
    for (const name of names()) {
      click(category(name!));
      const pane = editor().querySelector('section[aria-labelledby]')!;
      expect(pane.querySelector('[aria-controls]'), name!).toBeNull();
      // Paragraphs are prose; the pane's only one is its status, which the column shows where it has room.
      expect(
        [...pane.querySelectorAll('p')].map((p) => p.textContent),
        name!
      ).toEqual([category(name!).querySelector('span:nth-child(2) > span:last-child')!.textContent]);
    }
    dispose?.();
    document.body.replaceChildren();
  }
});

it('updates only the moved row and the status lines it affects', () => {
  const { slider, pointer, editor, status } = mount();
  pointer(slider('Size'), 'pointerdown', 150);
  const changed = new Set<Node>();
  const observer = new MutationObserver((records) => records.forEach((record) => changed.add(record.target)));
  observer.observe(editor(), { subtree: true, childList: true, attributes: true, characterData: true });
  pointer(slider('Size'), 'pointermove', 250);
  pointer(slider('Size'), 'pointerup', 250);
  observer.takeRecords().forEach((record) => changed.add(record.target));
  observer.disconnect();

  const sizeRow = slider('Size').parentElement!;
  const paintingStatus = status('Painting');
  expect(changed.size).toBeGreaterThan(0);
  for (const node of changed) {
    const element = node instanceof Element ? node : node.parentElement!;
    const title = editor().querySelector('h2 + p')!;
    expect(
      sizeRow.contains(element) || paintingStatus.contains(element) || title.contains(element),
      element.outerHTML
    ).toBe(true);
  }
});

it('cancels to the given baseline, disabled while nothing differs from it, and reports Done', () => {
  const onDone = vi.fn();
  const { brush, editor, slider, pointer, click, cancel } = mount(defaultBrush(), { onDone });
  expect(cancel().disabled).toBe(true);
  pointer(slider('Flow'), 'pointerdown', 290);
  pointer(slider('Flow'), 'pointerup', 290);
  expect(brush().flow).toBeCloseTo(0.95);
  expect(cancel().disabled).toBe(false);
  click(cancel());
  expect(brush().flow).toBe(defaultBrush().flow);
  expect(cancel().disabled).toBe(true);

  click([...editor().querySelectorAll('button')].find((button) => button.textContent === 'Done')!);
  expect(onDone).toHaveBeenCalledOnce();
});

it('cancels to the baseline the caller gives, not to the brush the editor was mounted with', () => {
  const given = snapshotBrushSettings({ ...defaultBrush(), size: 80, opacity: 0.5 });
  const { brush, click, cancel } = mount(defaultBrush(), { baseline: given });
  expect(cancel().disabled).toBe(false);
  click(cancel());
  expect(brush().size).toBe(80);
  expect(brush().opacity).toBe(0.5);
  expect(cancel().disabled).toBe(true);
});

it('disables Cancel changes when another brush and its baseline replace the edited one, until the next edit', () => {
  const { brush, setBrush, setBaseline, slider, pointer, click, cancel } = mount();
  pointer(slider('Flow'), 'pointerdown', 290);
  pointer(slider('Flow'), 'pointerup', 290);
  expect(cancel().disabled).toBe(false);

  // Another preset is chosen: the caller replaces the brush and takes its baseline.
  const textured: Brush = { ...defaultBrush(), size: 120, flow: 0.4, engine: { id: 'textured', settings: {} } };
  setBrush(textured);
  setBaseline(snapshotBrushSettings(textured));
  flush();
  expect(cancel().disabled).toBe(true);

  pointer(slider('Opacity'), 'pointerdown', 200);
  pointer(slider('Opacity'), 'pointerup', 200);
  expect(cancel().disabled).toBe(false);
  click(cancel());
  expect(brush().flow).toBe(0.4);
  expect(brush().size).toBe(120);
  expect(brush().opacity).toBe(textured.opacity);
});

it("shows the brush's name above the preview, and nothing in its place without one", () => {
  const { editor } = mount(defaultBrush(), { name: 'Soft round' });
  const top = () => editor().querySelector('canvas')!.parentElement!.parentElement!;
  expect(top().firstElementChild!.textContent).toBe('Soft round');
  dispose?.();
  document.body.replaceChildren();

  mount();
  expect(top().textContent).toBe('');
});

it('names each category button by its category and describes it by its status, as the icon-only layout needs', () => {
  const { editor, categories } = mount();
  const buttons = [...editor().querySelectorAll<HTMLElement>('nav button')];
  const text = (ids: string | null) =>
    ids!
      .split(' ')
      .map((id) => document.getElementById(id)!.textContent)
      .join(' ');
  expect(buttons.map((button) => text(button.getAttribute('aria-labelledby')))).toEqual(categories());
  expect(buttons.map((button) => text(button.getAttribute('aria-describedby')))).toEqual([
    '32 px · 100%',
    'Soft round · 65%',
    'Pressure → Size',
    'Off'
  ]);
  const icons = buttons.map((button) => button.querySelector('svg path')!.getAttribute('d'));
  expect(new Set(icons).size).toBe(icons.length);
});

it('shows a tapped category alone and goes back to the list in the narrow layout', () => {
  const { editor, category, click } = mount();
  const frame = editor().firstElementChild!;
  expect(frame.getAttribute('data-view')).toBe('list');
  click(category('Stroke correction'));
  expect(frame.getAttribute('data-view')).toBe('detail');
  expect(editor().querySelector('h2')!.textContent).toBe('Stroke correction');
  click([...editor().querySelectorAll('button')].find((button) => button.textContent === 'All categories')!);
  expect(frame.getAttribute('data-view')).toBe('list');
});

/**
 * Renders the editor over a brush kept by a controlled parent, with each slider's rail spanning x 100 to 300. The
 * baseline is the initial brush's settings unless one is given; both can be replaced, as a caller choosing another
 * preset does.
 */
function mount(
  initial: Brush = defaultBrush(),
  options: {
    onDone?: () => void;
    baseline?: BrushSettingsSnapshot;
    name?: string;
    categories?: readonly BrushCategory[];
  } = {}
) {
  const [brush, setBrush] = createSignal(initial);
  const [baseline, setBaseline] = createSignal(options.baseline ?? snapshotBrushSettings(initial));
  dispose = render(
    () => (
      <BrushEditor
        brush={brush()}
        baseline={baseline()}
        name={options.name}
        categories={options.categories}
        onChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
        onDone={options.onDone ?? (() => {})}
        preview={<canvas />}
      />
    ),
    document.body
  );
  flush();
  const editor = () => document.querySelector<HTMLElement>('[aria-label="Brush editor"]')!;
  const slider = (label: string) => {
    const labelled = [...editor().querySelectorAll<HTMLElement>('[role="slider"]')].find(
      (element) => document.getElementById(element.getAttribute('aria-labelledby')!)?.textContent === label
    );
    if (!labelled) {
      throw new Error(`No slider ${label}`);
    }

    const rail = labelled.firstElementChild as HTMLElement;
    rail.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 4 }) as DOMRect;
    labelled.setPointerCapture = vi.fn();
    return labelled;
  };
  const categories = () =>
    [...editor().querySelectorAll('nav button')].map((button) => button.querySelector('span span')!.textContent);
  const category = (label: string) =>
    [...editor().querySelectorAll<HTMLElement>('nav button')].find(
      (button) => button.querySelector('span span')!.textContent === label
    )!;
  /** The status line of a category in the column. */
  const status = (label: string) => category(label).querySelector('span:nth-child(2) > span:last-child')!;
  const click = (element: Element) => {
    (element as HTMLElement).click();
    flush();
  };
  const pointer = (target: Element, type: string, x: number, y = 0) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'pen' });
    target.dispatchEvent(event);
    flush();
    return event;
  };

  /** The button of the choice labelled `label` that opens its options. */
  const menu = (label: string) => {
    const button = [...editor().querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]')].find(
      (element) =>
        document.getElementById(element.getAttribute('aria-labelledby')!.split(' ')[0]!)?.textContent === label
    );
    if (!button) {
      throw new Error(`No menu ${label}`);
    }

    return button;
  };
  const cancel = () =>
    [...editor().querySelectorAll('button')].find((button) => button.textContent === 'Cancel changes')!;

  return { brush, setBrush, setBaseline, editor, slider, categories, category, status, click, pointer, cancel, menu };
}
