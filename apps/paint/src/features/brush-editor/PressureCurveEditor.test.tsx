// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { calibratePressure } from '@app-game/paint-core/strokeSettings';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { boundCurveValue, PressureCurveEditor, type CurveHandle } from './PressureCurveEditor';
import { getBrushSetting } from './schema';
import { SettingRow } from './SettingRow';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('keeps the minimum below the maximum and firmness in its range, whatever a handle is dragged to', () => {
  const range = { minimum: 0.3, maximum: 0.6 };
  expect(boundCurveValue(range, 'minimum', 0.9)).toBeCloseTo(0.59);
  expect(boundCurveValue(range, 'minimum', -1)).toBe(0);
  expect(boundCurveValue(range, 'maximum', 0.1)).toBeCloseTo(0.31);
  expect(boundCurveValue(range, 'maximum', 2)).toBe(1);
  expect(boundCurveValue(range, 'firmness', 0)).toBe(0.1);
  expect(boundCurveValue(range, 'firmness', 9)).toBe(5);

  const { values, handle, drag } = mount({ minimum: 0.3, maximum: 0.6, firmness: 1 });
  drag('maximum', -80, 0);
  expect(values().maximum).toBeCloseTo(0.31);
  expect(handle('maximum').getAttribute('aria-valuenow')).toBe('31');
  drag('minimum', 80, 0);
  expect(values().minimum).toBeCloseTo(0.3);
  expect(values().minimum).toBeLessThan(values().maximum);
  drag('firmness', 0, 500);
  expect(values().firmness).toBe(5);
});

it('drags each handle from where it was: the range across, firmness up for softer and down for firmer', () => {
  const { values, drag, handle } = mount({ minimum: 0.1, maximum: 0.9, firmness: 1 });
  drag('minimum', 10, 0);
  expect(values().minimum).toBeCloseTo(0.2);
  drag('maximum', -10, 0);
  expect(values().maximum).toBeCloseTo(0.8);
  // The firmness handle sits on the curve halfway between the ends, at 0.5 ** firmness: half way up while straight.
  expect(handle('firmness').style.top).toBe('50%');
  drag('firmness', 0, -25);
  expect(values().firmness).toBeCloseTo(Math.log(0.75) / Math.log(0.5));
  drag('firmness', 0, 60);
  expect(values().firmness).toBeCloseTo(Math.log(0.15) / Math.log(0.5));
  expect(parseFloat(handle('firmness').style.top)).toBeCloseTo(85);
});

it('offers number entry on a tap on a handle or its chip, and steps a focused handle with the arrow keys', () => {
  const entries: [CurveHandle, string][] = [];
  const { values, handle, pointer } = mount({ minimum: 0.1, maximum: 0.9, firmness: 1 }, (name, chip) =>
    entries.push([name, chip.textContent ?? ''])
  );
  pointer(handle('maximum').lastElementChild!, 'pointerdown', 0, 0);
  pointer(handle('maximum').lastElementChild!, 'pointerup', 2, 0);
  pointer(handle('firmness'), 'pointerdown', 0, 0);
  pointer(handle('firmness'), 'pointerup', 0, 0);
  expect(entries).toEqual([
    ['maximum', '90%'],
    ['firmness', '100%']
  ]);

  handle('minimum').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flush();
  expect(values().minimum).toBeCloseTo(0.11);
  handle('firmness').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  flush();
  expect(values().firmness).toBeCloseTo(0.95);
});

it("marks a pen's raw pressure on the curve while it presses the graph, and nothing for the mouse or a finger", () => {
  const { root, pointer } = mount({ minimum: 0.2, maximum: 0.8, firmness: 2 });
  const plot = root().querySelector<HTMLElement>('svg')!.parentElement!;
  const dot = () => root().querySelector<HTMLElement>('svg + span')!;

  for (const type of ['mouse', 'touch']) {
    pointer(plot, 'pointerdown', 10, 10, type, 0.5);
    expect(dot().hidden, type).toBe(true);
    pointer(plot, 'pointerup', 10, 10, type, 0);
  }

  pointer(plot, 'pointerdown', 10, 10, 'pen', 0.5);
  expect(dot().hidden).toBe(false);
  expect(dot().style.left).toBe('50%');
  const out = calibratePressure({ minimum: 0.2, maximum: 0.8, firmness: 2 }, 0.5);
  expect(parseFloat(dot().style.top)).toBeCloseTo(100 - out * 100);
  expect(root().querySelector('svg path:last-child')!.getAttribute('d')).not.toBe('');
  pointer(plot, 'pointermove', 12, 10, 'pen', 0.8);
  expect(dot().style.left).toBe('80%');
  pointer(plot, 'pointerup', 12, 10, 'pen', 0);
  expect(dot().hidden).toBe(true);
});

it("draws calibratePressure's curve: flat before the minimum and after the maximum", () => {
  const { root } = mount({ minimum: 0.25, maximum: 0.75, firmness: 2 });
  const path = root().querySelector('svg path:nth-child(2)')!.getAttribute('d')!;
  const points = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  expect(points[0]).toEqual([0, 100]);
  expect(points.at(-1)).toEqual([100, 0]);
  for (const [x, y] of points) {
    expect(y).toBeCloseTo(100 - calibratePressure({ minimum: 0.25, maximum: 0.75, firmness: 2 }, x! / 100) * 100, 1);
  }
});

it("writes the brush's three pressure settings from the editor's own row, and restores them on a cancelled press", () => {
  const setting = getBrushSetting('pressure-curve')!;
  const [brush, setBrush] = createSignal<Brush>({
    ...defaultBrush(),
    stroke: { ...defaultBrush().stroke, mode: 'stabilizer' }
  });
  dispose = render(
    () => <SettingRow setting={setting} brush={brush()} onChange={(patch) => setBrush((b) => ({ ...b, ...patch }))} />,
    document.body
  );
  flush();
  const handle = (name: string) => document.querySelector<HTMLElement>(`[data-curve-handle="${name}"]`)!;
  const plot = handle('minimum').parentElement!;
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  for (const [name, dx, dy] of [
    ['minimum', 10, 0],
    ['maximum', 10, 0],
    ['firmness', 0, 20]
  ] as const) {
    press(handle(name), 'pointerdown', 0, 0);
    press(handle(name), 'pointermove', dx, dy);
    press(handle(name), 'pointerup', dx, dy);
  }
  // Rounded as the settings round: the range to a percent, firmness to five.
  expect(brush().stroke).toMatchObject({ minimum: 0.15, maximum: 0.9 });
  expect(brush().stroke.firmness).toBeCloseTo(Math.round((Math.log(0.3) / Math.log(0.5)) * 20) / 20);

  const before = brush().stroke;
  press(handle('minimum'), 'pointerdown', 0, 0);
  press(handle('minimum'), 'pointermove', 30, 0);
  expect(brush().stroke.minimum).toBeCloseTo(0.45);
  handle('minimum').dispatchEvent(pointerEvent('pointercancel', 30, 0, 'pen', 0));
  flush();
  expect(brush().stroke).toEqual(before);
});

/** Mounts a controlled editor whose graph is 100 × 100 px at the origin; `inputs` records every `onInput`. */
function mount(
  initial: { minimum: number; maximum: number; firmness: number },
  onEntry?: (h: CurveHandle, chip: Element) => void
) {
  const [values, setValues] = createSignal(initial);
  const inputs: [CurveHandle, number][] = [];
  dispose = render(
    () => (
      <PressureCurveEditor
        label="Pressure curve"
        minimum={values().minimum}
        maximum={values().maximum}
        firmness={values().firmness}
        onInput={(handle, value) => {
          inputs.push([handle, value]);
          setValues((current) => ({ ...current, [handle]: value }));
        }}
        onEntry={onEntry}
      />
    ),
    document.body
  );
  flush();
  const root = () => document.querySelector<HTMLElement>('[role="group"][aria-label="Pressure curve"]')!;
  const handle = (name: CurveHandle) => root().querySelector<HTMLElement>(`[data-curve-handle="${name}"]`)!;
  handle('minimum').parentElement!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  const pointer = press;
  const drag = (name: CurveHandle, dx: number, dy: number) => {
    pointer(handle(name), 'pointerdown', 0, 0);
    pointer(handle(name), 'pointermove', dx, dy);
    pointer(handle(name), 'pointerup', dx, dy);
  };

  return { values, inputs, root, handle, drag, pointer };
}

function press(target: Element, type: string, x: number, y: number, pointerType = 'pen', pressure = 0.5) {
  target.dispatchEvent(pointerEvent(type, x, y, pointerType, pressure));
  flush();
}

function pointerEvent(type: string, x: number, y: number, pointerType: string, pressure: number) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
    pressure: { value: pressure }
  });
  return event;
}
