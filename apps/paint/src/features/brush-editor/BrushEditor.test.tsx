// @vitest-environment jsdom
import { brushSizeCurve, curveValue } from '@app-game/abr-brush/sliderCurves';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { BrushEditor } from './BrushEditor';
import { snapshotBrushSettings, type BrushSettingsSnapshot } from './schema';

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
  const { brush, editor, category, status, click } = mount();
  click(status('Stroke correction'));
  expect(category('Stroke correction').getAttribute('aria-current')).toBe('true');

  const option = [...editor().querySelectorAll('[role="radio"]')].find((radio) =>
    radio.textContent?.includes('Leonardo smooth')
  )!;
  expect(option.getAttribute('aria-checked')).toBe('false');
  click(option.lastElementChild!);
  expect(brush().stroke.mode).toBe('smooth');
  expect(option.getAttribute('aria-checked')).toBe('true');
  expect(editor().textContent).toContain('Higher stabilization smooths more');

  const toggle = editor().querySelector<HTMLElement>('[role="switch"]')!;
  const on = brush().stroke.catchUp;
  click(toggle.lastElementChild!);
  expect(brush().stroke.catchUp).toBe(!on);
  expect(toggle.getAttribute('aria-checked')).toBe(String(!on));
});

it('shows a greyed row with its value, announces it disabled and ignores presses', () => {
  const { brush, editor, category, click, slider, pointer } = mount();
  click(category('Stroke correction'));
  // Studio smoothing: the Leonardo level, the stabilizer level and catch-up do not apply.
  const level = slider('Stabilization');
  expect(level.getAttribute('aria-disabled')).toBe('true');
  expect(level.getAttribute('aria-valuenow')).toBe('1');
  expect(editor().querySelector<HTMLInputElement>('input[aria-label="Stabilization"]')!.value).toBe('1');
  expect(editor().querySelector<HTMLInputElement>('input[aria-label="Stabilization"]')!.disabled).toBe(true);
  const before = brush();
  pointer(level, 'pointerdown', 280);
  pointer(level, 'pointermove', 290);
  level.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const catchUp = editor().querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(catchUp.disabled).toBe(true);
  catchUp.click();
  flush();
  expect(brush()).toBe(before);
});

it('keeps every row in place while a slider drags and after a switch or a choice changes', () => {
  const { editor, category, click, slider, pointer } = mount();
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

  click(category('Stroke correction'));
  const correction = rows();
  for (const radio of editor().querySelectorAll<HTMLElement>('[role="radio"]')) {
    click(radio);
    expect(rows()).toEqual(correction);
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

it("shows a category's note in place of rows when none of its settings apply", () => {
  const { editor, category, click, categories } = mount({ ...defaultBrush(), engine: { id: 'abr', settings: {} } });
  expect(categories()).toEqual(['Painting', 'Brush tip', 'Stroke correction', 'Pressure curve']);
  click(category('Brush tip'));
  expect(editor().textContent).toContain('ABR presets keep their own tip shape and pressure dynamics.');
  expect(editor().querySelector('[role="slider"]')).toBeNull();
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
    'Studio',
    'Off'
  ]);
  const icons = buttons.map((button) => button.querySelector('svg path')!.getAttribute('d'));
  expect(new Set(icons).size).toBe(icons.length);
});

it('shows a tapped category alone and goes back to the list in the narrow layout', () => {
  const { editor, category, click } = mount();
  const frame = editor().firstElementChild!;
  expect(frame.getAttribute('data-view')).toBe('list');
  click(category('Pressure curve'));
  expect(frame.getAttribute('data-view')).toBe('detail');
  expect(editor().querySelector('h2')!.textContent).toBe('Pressure curve');
  click([...editor().querySelectorAll('button')].find((button) => button.textContent === 'All categories')!);
  expect(frame.getAttribute('data-view')).toBe('list');
  expect(editor().textContent).toContain('About pressure curve');
});

/**
 * Renders the editor over a brush kept by a controlled parent, with each slider's rail spanning x 100 to 300. The
 * baseline is the initial brush's settings unless one is given; both can be replaced, as a caller choosing another
 * preset does.
 */
function mount(
  initial: Brush = defaultBrush(),
  options: { onDone?: () => void; baseline?: BrushSettingsSnapshot; name?: string } = {}
) {
  const [brush, setBrush] = createSignal(initial);
  const [baseline, setBaseline] = createSignal(options.baseline ?? snapshotBrushSettings(initial));
  dispose = render(
    () => (
      <BrushEditor
        brush={brush()}
        baseline={baseline()}
        name={options.name}
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

  const cancel = () =>
    [...editor().querySelectorAll('button')].find((button) => button.textContent === 'Cancel changes')!;

  return { brush, setBrush, setBaseline, editor, slider, categories, category, status, click, pointer, cancel };
}
