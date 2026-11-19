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
import { Icon, PenNeeded, PressureStrip, StrokeGlyph, StrokeHint } from './StepPictures';

/**
 * Pen pressure calibration as a block of its own, for a dialog, a panel or a page; it needs no editor. Three steps of
 * pen strokes, drawn as usual, firmly and lightly, fit one curve for the device (`fitPressureCurve`). The steps speak
 * in pictures, without sentences: a row of three stroke pictograms of growing and shrinking weight marks the current
 * step, and its line fills as pen samples come in; a looping picture shows the stroke wanted, a pen tip leaving a line
 * as heavy as the pressure asked for; a histogram of the pressures measured so far (`histogram`) fills as the pen
 * draws. Back, Cancel and Next (Finish on the last step) are icon buttons with accessible names; Next waits until the
 * step has enough samples. Mouse and touch strokes are not measured: while the latest contact was not a pen, a
 * pictogram shows that a pen is needed in place of the looping picture.
 *
 * The strokes are drawn on a test canvas of the block's own, or on the canvases inside `surface`, such as a larger
 * drawing pad of the host's. The result shows the curve over the measured pressure: its points are added, dragged and
 * removed on the graph (`PressureCurveEditor`), and the strokes drawn on the test canvas below are drawn again with
 * each change, while a dot on the curve follows the pen's pressure. Save hands the curve to the host; nothing is
 * stored here. With a `saved` curve it starts at the result. With `onMeasured` it only measures: the fitted curve goes
 * to the host after the last step.
 *
 * Colours and sizes come from the host's custom properties; see `PressureCalibration.module.css`.
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
  /**
   * Where the measuring steps take their strokes from: pen strokes on any canvas inside it count, and the block shows
   * no test canvas of its own while measuring. Without it, the block's own test canvas.
   */
  surface?: Element | undefined;
  /** Whether the measuring steps show the pressures measured so far; true by default. */
  histogram?: boolean;
  /** Shown under the result's test canvas, such as why the canvas keeps an earlier brush. */
  note?: JSX.Element;
  /**
   * Receives the fitted curve and the raw pressures it was fitted to (sorted, for a histogram) at the end of the last
   * step, in place of the result: a host with its own curve editor, such as a brush studio, measures here and edits
   * there. Read when the last step ends.
   */
  onMeasured?: (curve: PressureCurve, measured: readonly number[]) => void;
}) {
  const [ownSurface, setOwnSurface] = createSignal<HTMLElement>();
  const [step, setStep] = createSignal<Step>(untrack(() => (props.saved ? 'result' : 'normal')));
  const pen = createPenStrokes(() => (step() !== 'result' && props.surface) || ownSurface());
  const [curve, setCurve] = createSignal<PressureCurve>(untrack(() => props.saved ?? identityPressureCurve));
  /** Raw pressures counted from every step, sorted, for the result's histogram. */
  const [measured, setMeasured] = createSignal<readonly number[]>([]);
  /** The counted raw pressures of each finished step, for the live histogram. */
  const [finished, setFinished] = createSignal<Partial<Record<MeasuringStep, readonly number[]>>>({});
  /** The measuring step on screen, or `undefined` at the result. */
  const measuring = () => {
    const current = step();
    return current === 'result' ? undefined : current;
  };
  const collected: Partial<Record<MeasuringStep, PressureStroke[]>> = {};
  const edited = () => !props.saved || !samePressureCurve(props.saved, curve());
  /** How far step `each` is, from 0 to 1: finished steps are full, the current one counts its samples as drawn. */
  const progress = (each: MeasuringStep, current: MeasuringStep) => {
    const order = stepOrder.indexOf(each) - stepOrder.indexOf(current);
    return order < 0 ? 1 : order > 0 ? 0 : Math.min(1, (pen.counted() + pen.drawing().length) / stepSamples[each]);
  };
  const groups = (current: MeasuringStep) =>
    stepOrder.map((each) => ({
      weight: each,
      pressures: each === current ? [...pen.pressures(), ...pen.drawing()] : (finished()[each] ?? [])
    }));
  const canvas = (redraw: boolean) => (
    <div ref={setOwnSurface} class={styles.canvas}>
      <BrushPreview
        brush={props.preview?.brush ?? testBrush}
        resources={props.preview?.resources}
        recipe={props.preview?.recipe}
        color={props.preview?.color}
        mixing={props.preview?.mixing}
        width={1024}
        height={512}
        redraw={redraw}
        controls={redraw}
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
              <ol class={styles.steps} aria-label="Steps">
                {stepOrder.map((each) => (
                  <li
                    aria-current={each === current() ? 'step' : undefined}
                    aria-label={stepName[each]}
                    data-done={stepOrder.indexOf(each) < stepOrder.indexOf(current()) ? '' : undefined}
                  >
                    <StrokeGlyph weight={each} progress={progress(each, current())} />
                    <Show when={each === current()}>
                      <span
                        class={styles.meter}
                        role="progressbar"
                        aria-label="Pen samples"
                        aria-valuemin={0}
                        aria-valuemax={stepSamples[each]}
                        aria-valuenow={Math.min(stepSamples[each], pen.counted())}
                      />
                    </Show>
                  </li>
                ))}
              </ol>
              <div class={styles.stage}>
                <Show
                  when={pen.otherPointer()}
                  fallback={<StrokeHint weight={current()} label={stepName[current()]} />}
                >
                  {(type) => <PenNeeded type={type()} />}
                </Show>
              </div>
              <Show when={props.histogram ?? true}>
                <PressureStrip groups={groups(current())} />
              </Show>
              <Show when={!props.surface}>{canvas(false)}</Show>
              <div class={styles.actions}>
                <button
                  type="button"
                  aria-label="Back"
                  title="Back"
                  disabled={current() === stepOrder[0]}
                  onClick={() => back(current())}
                >
                  <Icon name="back" />
                </button>
                <Show when={props.onCancel}>
                  {(cancel) => (
                    <button type="button" aria-label="Cancel" title="Cancel" onClick={() => cancel()()}>
                      <Icon name="cancel" />
                    </button>
                  )}
                </Show>
                <button
                  type="button"
                  class={styles.primary}
                  aria-label={current() === 'light' ? 'Finish' : 'Next'}
                  title={current() === 'light' ? 'Finish' : 'Next'}
                  disabled={pen.counted() < stepSamples[current()]}
                  onClick={() => next(current())}
                >
                  <Icon name={current() === 'light' ? 'finish' : 'next'} />
                </button>
              </div>
            </>
          )}
        </Match>
        <Match when={step() === 'result'}>
          <PressureCurveEditor curve={curve()} measured={measured()} marker={pen.pressure()} onChange={setCurve} />
          {canvas(true)}
          <Show when={props.note}>
            <p class={styles.note}>{props.note}</p>
          </Show>
          <div class={styles.actions}>
            <button type="button" aria-label="Measure again" title="Measure again" onClick={again}>
              <Icon name="again" />
            </button>
            <button
              type="button"
              aria-label="Reset"
              title="Reset"
              disabled={!props.saved}
              onClick={() => props.onReset()}
            >
              <Icon name="reset" />
            </button>
            <Show when={props.onCancel}>
              {(cancel) => (
                <button type="button" aria-label="Cancel" title="Cancel" onClick={() => cancel()()}>
                  <Icon name="cancel" />
                </button>
              )}
            </Show>
            <button
              type="button"
              class={styles.primary}
              aria-label="Save"
              title="Save"
              disabled={!edited()}
              onClick={() => props.onSave(curve())}
            >
              <Icon name="finish" />
            </button>
          </div>
        </Match>
      </Switch>
    </div>
  );

  /** Keeps the strokes of `current` and moves to the next step, or fits the curve after the last one. */
  function next(current: MeasuringStep) {
    const strokes = pen.take();
    collected[current] = strokes;
    setFinished((all) => ({ ...all, [current]: strokePressures(strokes) }));
    const following = stepOrder[stepOrder.indexOf(current) + 1];
    if (following) {
      setStep(following);
      return;
    }

    const { normal = [], hard = [], light = [] } = collected;
    const fitted = fitPressureCurve({ normal, hard, light });
    const pressures = strokePressures([...normal, ...hard, ...light]);
    if (props.onMeasured) {
      props.onMeasured(fitted, pressures);
      return;
    }

    setCurve(fitted);
    setMeasured(pressures);
    setStep('result');
  }

  /** Discards the strokes of `current` and of the step before it, and measures that step again. */
  function back(current: MeasuringStep) {
    const previous = stepOrder[stepOrder.indexOf(current) - 1];
    if (!previous) {
      return;
    }

    pen.take();
    delete collected[previous];
    setFinished(({ [previous]: _dropped, ...kept }) => kept);
    setStep(previous);
  }

  /** Discards the measured strokes and starts from the first step. */
  function again() {
    pen.take();
    for (const each of stepOrder) {
      delete collected[each];
    }

    setFinished({});
    setMeasured([]);
    setStep('normal');
  }
}

/** The screens: the three measuring steps, then the fitted curve. */
type Step = MeasuringStep | 'result';

/** The strokes of a step: drawn as usual, firmly and lightly; see `fitPressureCurve`. */
type MeasuringStep = (typeof stepOrder)[number];

const stepOrder = ['normal', 'hard', 'light'] as const;

/** Each step's name, which its pictogram and its looping picture are labelled with. */
const stepName = { normal: 'As usual', hard: 'Firm', light: 'Light' } satisfies Record<MeasuringStep, string>;

/** Counted pen samples each step needs: a median wants about a thousand, the ends a few strokes. */
const stepSamples = { normal: 1000, hard: 300, light: 300 } satisfies Record<MeasuringStep, number>;

/** A plain round brush whose size follows pressure, so the canvas shows only the pen's curve. */
const testBrush = { ...defaultBrush(), color: '#2b3238', size: 36, hardness: 0.8, flow: 1, spacing: 0.08 };
