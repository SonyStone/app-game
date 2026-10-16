// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import type { PressureCurve } from '@app-game/paint-core/pressureCurve';
import { render, type JSX } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPressureCalibration } from './createPressureCalibration';
import { PressureCalibration } from './PressureCalibration';

/** Props of every mounted test canvas; read through them, as their getters follow the curve. */
const preview = vi.hoisted(() => ({
  props: [] as { mapPressure?: (raw: number) => number; redraw?: boolean; brush?: { color: string } }[]
}));
vi.mock('@app-game/brush-preview', () => ({
  BrushPreview: (props: (typeof preview.props)[number]) => {
    preview.props.push(props);
    return <canvas />;
  }
}));

const disposals: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  preview.props = [];
});
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});

describe('createPressureCalibration', () => {
  it('leaves pressure unchanged until saved, then remembers the curve for the next session', () => {
    const first = calibration();
    expect(first.calibration()).toBeUndefined();
    expect(first.mapPressure(0.37)).toBe(0.37);

    first.save(points([0.05, 0], [0.5, 0.5], [0.75, 1]));
    expect(first.mapPressure(0.5)).toBeCloseTo(0.5);
    expect(first.mapPressure(0.8)).toBe(1);
    const stored = JSON.parse(localStorage.getItem('paint.pressureCalibration')!);
    expect(stored).toMatchObject({ version: 2, curve: points([0.05, 0], [0.5, 0.5], [0.75, 1]) });
    expect(typeof stored.date).toBe('string');
    expect(stored.userAgent).toBe(navigator.userAgent);

    const next = calibration();
    expect(next.curve()).toEqual(points([0.05, 0], [0.5, 0.5], [0.75, 1]));
    next.reset();
    expect(next.mapPressure(0.8)).toBe(0.8);
    expect(localStorage.getItem('paint.pressureCalibration')).toBeNull();
  });

  it('reads a calibration saved with zero, half and full pressure as those three points', () => {
    localStorage.setItem(
      'paint.pressureCalibration',
      JSON.stringify({ version: 1, curve: { minimum: 0.05, middle: 0.42, maximum: 0.8 }, date: 'd', userAgent: 'u' })
    );
    expect(calibration().calibration()).toEqual({
      curve: points([0.05, 0], [0.42, 0.5], [0.8, 1]),
      date: 'd',
      userAgent: 'u'
    });
  });

  it("widens a brush's default pressure range to the full range only while the pen is calibrated", () => {
    const settings = calibration();
    const plain = defaultBrush();
    const own = { ...plain, stroke: { ...plain.stroke, minimum: 0.1, maximum: 0.7 } };
    expect(settings.strokeBrush(plain)).toBe(plain);

    settings.save(points([0.05, 0], [0.5, 0.5], [0.75, 1]));
    expect(settings.strokeBrush(plain).stroke).toEqual({ ...plain.stroke, minimum: 0, maximum: 1 });
    expect(plain.stroke).toEqual(defaultBrush().stroke);
    expect(settings.strokeBrush(own)).toBe(own);

    settings.reset();
    expect(settings.strokeBrush(plain)).toBe(plain);
  });

  it('forgets the calibration when saving the identity curve, and ignores unreadable storage', () => {
    const saved = calibration();
    saved.save(points([0.1, 0], [0.4, 0.5], [0.7, 1]));
    saved.save(points([0, 0], [1, 1]));
    expect(saved.calibration()).toBeUndefined();
    expect(localStorage.getItem('paint.pressureCalibration')).toBeNull();

    localStorage.setItem('paint.pressureCalibration', '{not json');
    expect(calibration().calibration()).toBeUndefined();
    localStorage.setItem('paint.pressureCalibration', JSON.stringify({ version: 2, curve: { minimum: 0.3 } }));
    expect(calibration().calibration()).toBeUndefined();
    localStorage.setItem('paint.pressureCalibration', JSON.stringify({ version: 3, curve: points([0.1, 0], [1, 1]) }));
    expect(calibration().calibration()).toBeUndefined();
  });
});

describe('PressureCalibration', () => {
  it('measures three steps of pen strokes, ignores the mouse, and hands over the fitted curve', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    mount(() => (
      <PressureCalibration saved={undefined} onSave={onSave} onReset={() => undefined} onCancel={onCancel} />
    ));
    const next = () => button(/^(Next|Show the curve)$/);
    expect(next().disabled).toBe(true);

    stroke('mouse', () => 1);
    flush();
    expect(document.body.textContent).toContain('mouse strokes are not counted');
    expect(next().disabled).toBe(true);

    // As usual: a median of 0.55, as on the user's MovinkPad.
    for (let index = 0; index < 5; index++) {
      stroke('pen', (t) => 0.4 + 0.3 * t);
    }
    flush();
    expect(document.body.textContent).not.toContain('not counted');
    next().click();
    flush();
    expect(next().disabled).toBe(true);

    // Firm, then light.
    for (let index = 0; index < 2; index++) {
      stroke('pen', (t) => 0.75 + 0.1 * t);
    }
    flush();
    next().click();
    flush();
    for (let index = 0; index < 2; index++) {
      stroke('pen', (t) => 0.08 + 0.04 * t);
    }
    flush();
    next().click();
    flush();

    // The result's canvas keeps its strokes and draws them with the fitted curve.
    const tryCanvas = preview.props.at(-1)!;
    expect(tryCanvas.redraw).toBe(true);
    expect(tryCanvas.mapPressure!(0.55)).toBeCloseTo(0.5, 1);
    expect(tryCanvas.mapPressure!(0.85)).toBe(1);
    expect(document.querySelectorAll('[data-point]')).toHaveLength(5);

    button('Save').click();
    const saved: PressureCurve = onSave.mock.calls[0]![0];
    expect(saved.points).toHaveLength(5);
    expect(saved.points[0]!.x).toBeGreaterThan(0.07);
    expect(saved.points[0]!.x).toBeLessThan(0.1);
    expect(saved.points[2]).toEqual({ x: expect.closeTo(0.55, 1), y: 0.5 });
    expect(saved.points[4]!.x).toBeGreaterThan(0.8);
    expect(saved.points[4]!.x).toBeLessThan(0.85);
  });

  it('moves points freely by keyboard and drag, keeping them between their neighbours, and redraws', () => {
    const onSave = vi.fn();
    mount(() => (
      <PressureCalibration saved={points([0.05, 0], [0.5, 0.5], [0.8, 1])} onSave={onSave} onReset={() => undefined} />
    ));
    expect(button('Save').disabled).toBe(true);
    const tryCanvas = preview.props.at(-1)!;
    const before = tryCanvas.mapPressure!;

    key(1, 'ArrowLeft', true);
    key(1, 'ArrowUp');
    expect(label(1)).toBe('Point 2 of 3: pen 40%, brush 51%');
    expect(tryCanvas.mapPressure).not.toBe(before);
    expect(tryCanvas.mapPressure!(0.4)).toBeCloseTo(0.51);

    const graph = chart();
    graph.pointer('pointerdown', 0.8, 1);
    graph.pointer('pointermove', 0.7, 0.9);
    expect(label(2)).toBe('Point 3 of 3: pen 70%, brush 90%');
    // Past the previous point it stops just after it, and never below its output.
    graph.pointer('pointermove', 0.2, 0.3);
    graph.pointer('pointerup', 0.2, 0.3);
    expect(label(2)).toBe('Point 3 of 3: pen 42%, brush 51%');

    // The end points move too: a threshold and a least pressure.
    graph.pointer('pointerdown', 0.05, 0);
    graph.pointer('pointermove', 0.1, 0.2);
    graph.pointer('pointerup', 0.1, 0.2);
    expect(label(0)).toBe('Point 1 of 3: pen 10%, brush 20%');
    expect(tryCanvas.mapPressure!(0.05)).toBeCloseTo(0.2);

    button('Save').click();
    expect(onSave).toHaveBeenCalledWith(points([0.1, 0.2], [0.4, 0.51], [0.42, 0.51]));
  });

  it('adds points on the curve, up to eight, and removes them by double tap, dragging off the graph or Delete', () => {
    mount(() => (
      <PressureCalibration saved={points([0, 0], [1, 1])} onSave={() => undefined} onReset={() => undefined} />
    ));
    const graph = chart();
    const count = () => document.querySelectorAll('[data-point]').length;

    // Away from the curve nothing happens; on it a point is added and dragged at once.
    graph.pointer('pointerdown', 0.3, 0.8);
    graph.pointer('pointerup', 0.3, 0.8);
    expect(count()).toBe(2);
    graph.pointer('pointerdown', 0.3, 0.3);
    graph.pointer('pointermove', 0.3, 0.45);
    graph.pointer('pointerup', 0.3, 0.45);
    expect(label(1)).toBe('Point 2 of 3: pen 30%, brush 45%');

    // Dragged off the graph, it is marked, and removed on release.
    graph.pointer('pointerdown', 0.3, 0.45);
    graph.pointer('pointermove', 0.3, 1.3);
    expect(document.querySelector('[data-removing="true"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Let go to remove the point');
    graph.pointer('pointerup', 0.3, 1.3);
    expect(count()).toBe(2);

    for (const raw of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
      graph.pointer('pointerdown', raw, raw, 1000 * raw);
      graph.pointer('pointerup', raw, raw);
    }
    expect(count()).toBe(8);
    graph.pointer('pointerdown', 0.85, 0.85);
    graph.pointer('pointerup', 0.85, 0.85);
    expect(count()).toBe(8);

    // Two presses on a point within 350 ms remove it; the ends stay.
    graph.pointer('pointerdown', 0.4, 0.4, 5000);
    graph.pointer('pointerup', 0.4, 0.4);
    graph.pointer('pointerdown', 0.4, 0.4, 5200);
    graph.pointer('pointerup', 0.4, 0.4);
    expect(count()).toBe(7);
    graph.pointer('pointerdown', 1, 1, 6000);
    graph.pointer('pointerup', 1, 1);
    graph.pointer('pointerdown', 1, 1, 6100);
    graph.pointer('pointerup', 1, 1);
    expect(count()).toBe(7);

    key(1, 'Delete');
    expect(count()).toBe(6);
    key(0, 'Delete');
    expect(count()).toBe(6);
  });

  it('shows the pressure of the pen touching the test canvas as a dot on the curve', () => {
    mount(() => (
      <PressureCalibration
        saved={points([0, 0], [0.5, 0.8], [1, 1])}
        onSave={() => undefined}
        onReset={() => undefined}
      />
    ));
    expect(document.querySelector('circle[class*="marker"]')).toBeNull();
    const canvas = document.querySelector('canvas')!;
    const pointer = (type: string, pressure: number) => {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'pen' },
        pressure: { value: pressure }
      });
      canvas.dispatchEvent(event);
    };
    pointer('pointerdown', 0.5);
    flush();
    const marker = document.querySelector('circle[class*="marker"]')!;
    expect(Number(marker.getAttribute('cx'))).toBeCloseTo(28 + 0.5 * 424);
    expect(Number(marker.getAttribute('cy'))).toBeCloseTo(232 - 0.8 * 204);
    expect(document.body.textContent).toContain('Pen 50% → brush 80%');
    pointer('pointerup', 0);
    flush();
    expect(document.querySelector('circle[class*="marker"]')).toBeNull();
  });

  it('starts measuring again or resets a saved curve', () => {
    const onReset = vi.fn();
    mount(() => (
      <PressureCalibration saved={points([0.05, 0], [0.5, 0.5], [0.8, 1])} onSave={() => undefined} onReset={onReset} />
    ));
    button('Reset').click();
    expect(onReset).toHaveBeenCalledOnce();
    button('Measure again').click();
    flush();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('As usual');
    expect(preview.props.at(-1)!.redraw).toBe(false);
  });
});

function mount(component: () => JSX.Element) {
  disposals.push(render(component, document.body));
  flush();
}

/** A curve through `[x, y]` pairs. */
function points(...pairs: [number, number][]): PressureCurve {
  return { points: pairs.map(([x, y]) => ({ x, y })) };
}

function label(index: number) {
  return document.querySelector(`[data-point="${index}"]`)!.getAttribute('aria-label');
}

function key(index: number, name: string, shiftKey = false) {
  document
    .querySelector(`[data-point="${index}"]`)!
    .dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));
  flush();
}

/**
 * The curve graph, laid out at its own 480 × 260 units: `pointer` presses at raw pen pressure `raw` and output `value`,
 * which sit at 28 + 424 × raw across and 232 − 204 × value down.
 */
function chart() {
  const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Pressure curve"]')!;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 260 }) as DOMRect;
  svg.setPointerCapture = () => undefined;
  return {
    pointer(type: string, raw: number, value: number, timeStamp = 0) {
      const event = new MouseEvent(type, {
        clientX: 28 + raw * 424,
        clientY: 232 - value * 204,
        bubbles: true,
        button: 0
      });
      Object.defineProperties(event, {
        pointerId: { value: 3 },
        pointerType: { value: 'pen' },
        timeStamp: { value: timeStamp }
      });
      svg.dispatchEvent(event);
      flush();
    }
  };
}

function calibration() {
  return createRoot((dispose) => {
    disposals.push(dispose);
    return createPressureCalibration();
  });
}

function button(name: string | RegExp) {
  const found = [...document.querySelectorAll('button')].find((each) =>
    typeof name === 'string' ? each.textContent === name : name.test(each.textContent ?? '')
  );
  if (!found) {
    throw new Error(`No button ${name}`);
  }

  return found;
}

/** One second of contact on the test canvas, sampled every 4 ms, with `pressure` over the stroke's progress. */
function stroke(pointerType: string, pressure: (progress: number) => number) {
  const canvas = document.querySelector('canvas')!;
  const samples = Array.from({ length: 250 }, (_, index) => ({
    timeStamp: index * 4,
    pressure: pressure(index / 249),
    buttons: 1
  }));
  const pointer = (type: string, extra: Record<string, unknown>) => {
    const event = new MouseEvent(type, { bubbles: true });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType, ...extra })) {
      Object.defineProperty(event, key, { value });
    }

    canvas.dispatchEvent(event);
  };
  pointer('pointerdown', { ...samples[0], timeStamp: 0 });
  pointer('pointermove', { ...samples.at(-1), getCoalescedEvents: () => samples.slice(1) });
  pointer('pointerup', { timeStamp: 1000, pressure: 0 });
}
