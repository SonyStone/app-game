import { BrushPreview } from '@app-game/brush-preview';
import { defaultBrush } from '@app-game/paint-core/brush';
import {
  fitPressureCurve,
  identityPressureCurve,
  pressureMapping,
  samePressureCurve,
  strokePressures,
  type PressureCurve,
  type PressureStroke
} from '@app-game/paint-core/pressureCurve';
import type { JSX } from '@solidjs/web';
import { createSignal, Match, Show, Switch, untrack } from 'solid-js';
import { createPenStrokes } from './createPenStrokes';
import styles from './PressureCalibration.module.css';
import { PressureCurveEditor } from './PressureCurveEditor';

/**
 * Pen pressure calibration as a block of its own, for a dialog, a panel or a page; it needs no editor. Three steps of
 * strokes on a test canvas, drawn as usual, firmly and lightly, fit one curve for the device (`fitPressureCurve`).
 * The result shows the curve over the measured pressure: its points are added, dragged and removed on the graph
 * (`PressureCurveEditor`), and the strokes drawn on the test canvas below are drawn again with each change, while a
 * dot on the curve follows the pen's pressure. Save hands the curve to the host; nothing is stored here.
 * With a `saved` curve it starts at the result. Mouse and touch strokes are not measured; it then asks for a pen.
 */
export function PressureCalibration(props: {
  /** The device's saved curve, or `undefined` while the pen is not calibrated. Read once, when mounted. */
  saved: PressureCurve | undefined;
  /** Receives the curve to keep. */
  onSave: (curve: PressureCurve) => void;
  /** Returns the pen to raw pressure; offered while a curve is saved. */
  onReset: () => void;
  /** Leaves without saving; the Cancel button is shown only when this is given. */
  onCancel?: () => void;
  /**
   * What the test canvas draws with; see `BrushPreview`. Defaults to a plain round brush whose size follows pressure.
   * An editor passes its current brush, the brush's images and its own recipe, so the canvas draws as its own does.
   */
  preview?: Pick<Parameters<typeof BrushPreview>[0], 'brush' | 'resources' | 'recipe' | 'color' | 'mixing'>;
  /** Shown under the result's test canvas, such as how the host's brushes combine the curve with their own. */
  note?: JSX.Element;
}) {
  const [surface, setSurface] = createSignal<HTMLElement>();
  const pen = createPenStrokes(surface);
  const [step, setStep] = createSignal<Step>(untrack(() => (props.saved ? 'result' : 'normal')));
  const [curve, setCurve] = createSignal<PressureCurve>(untrack(() => props.saved ?? identityPressureCurve));
  /** Raw pressures counted from every step, sorted, for the histogram. */
  const [measured, setMeasured] = createSignal<readonly number[]>([]);
  /** The measuring step on screen, or `undefined` at the result. */
  const measuring = () => {
    const current = step();
    return current === 'result' ? undefined : current;
  };
  const collected: Partial<Record<MeasuringStep, PressureStroke[]>> = {};
  const edited = () => !props.saved || !samePressureCurve(props.saved, curve());
  const canvas = (redraw: boolean) => (
    <div ref={setSurface} class={styles.canvas}>
      <BrushPreview
        brush={props.preview?.brush ?? testBrush}
        resources={props.preview?.resources}
        recipe={props.preview?.recipe}
        color={props.preview?.color}
        mixing={props.preview?.mixing}
        width={1024}
        height={512}
        redraw={redraw}
        mapPressure={redraw ? pressureMapping(curve()) : undefined}
      />
    </div>
  );

  return (
    <div class={styles.calibration}>
      <Switch>
        <Match when={measuring()}>
          {(current) => (
            <>
              <ol class={styles.steps}>
                {stepOrder.map((each) => (
                  <li aria-current={each === current() ? 'step' : undefined}>{stepText[each].name}</li>
                ))}
              </ol>
              <p class={styles.instruction}>{stepText[current()].instruction}</p>
              {canvas(false)}
              <progress
                class={styles.progress}
                aria-label="Pen samples"
                max={stepSamples[current()]}
                value={pen.counted()}
              />
              <Show when={pen.otherPointer()}>
                {(type) => (
                  <p class={styles.warning} role="status">
                    Calibration measures a pen; {type()} strokes are not counted and change nothing.
                  </p>
                )}
              </Show>
              <div class={styles.actions}>
                <button
                  class={styles.primary}
                  disabled={pen.counted() < stepSamples[current()]}
                  onClick={() => next(current())}
                >
                  {current() === 'light' ? 'Show the curve' : 'Next'}
                </button>
                <Show when={props.onCancel}>{(cancel) => <button onClick={() => cancel()()}>Cancel</button>}</Show>
              </div>
            </>
          )}
        </Match>
        <Match when={step() === 'result'}>
          <PressureCurveEditor curve={curve()} measured={measured()} marker={pen.pressure()} onChange={setCurve} />
          <p class={styles.instruction}>
            Drag points freely, tap the curve to add one, double-tap a point or drag it off the graph to remove it. Draw
            on the canvas below: its strokes follow every change, and a dot shows your pressure on the curve.
          </p>
          {canvas(true)}
          <Show when={props.note}>
            <p class={styles.note}>{props.note}</p>
          </Show>
          <div class={styles.actions}>
            <button class={styles.primary} disabled={!edited()} onClick={() => props.onSave(curve())}>
              Save
            </button>
            <button onClick={again}>Measure again</button>
            <button disabled={!props.saved} onClick={() => props.onReset()}>
              Reset
            </button>
            <Show when={props.onCancel}>{(cancel) => <button onClick={() => cancel()()}>Cancel</button>}</Show>
          </div>
        </Match>
      </Switch>
    </div>
  );

  /** Keeps the strokes of `current` and moves to the next step, or fits the curve after the last one. */
  function next(current: MeasuringStep) {
    collected[current] = pen.take();
    const following = stepOrder[stepOrder.indexOf(current) + 1];
    if (following) {
      setStep(following);
      return;
    }

    const { normal = [], hard = [], light = [] } = collected;
    setCurve(fitPressureCurve({ normal, hard, light }));
    setMeasured(strokePressures([...normal, ...hard, ...light]));
    setStep('result');
  }

  /** Discards the measured strokes and starts from the first step. */
  function again() {
    pen.take();
    for (const each of stepOrder) {
      delete collected[each];
    }

    setMeasured([]);
    setStep('normal');
  }
}

/** The screens: the three measuring steps, then the fitted curve. */
type Step = MeasuringStep | 'result';

/** The strokes of a step: drawn as usual, firmly and lightly; see `fitPressureCurve`. */
type MeasuringStep = (typeof stepOrder)[number];

const stepOrder = ['normal', 'hard', 'light'] as const;

const stepText = {
  normal: { name: 'As usual', instruction: 'Draw as you usually do: a few ordinary strokes, until the bar fills.' },
  hard: { name: 'Firm', instruction: 'Draw a few strokes with the firmest pressure that is still comfortable.' },
  light: { name: 'Light', instruction: 'Draw a few of the lightest strokes that still leave a line.' }
} satisfies Record<MeasuringStep, { name: string; instruction: string }>;

/** Counted pen samples each step needs: a median wants about a thousand, the ends a few strokes. */
const stepSamples = { normal: 1000, hard: 300, light: 300 } satisfies Record<MeasuringStep, number>;

/** A plain round brush whose size follows pressure, so the canvas shows only the pen's curve. */
const testBrush = { ...defaultBrush(), color: '#2b3238', size: 36, hardness: 0.8, flow: 1, spacing: 0.08 };
