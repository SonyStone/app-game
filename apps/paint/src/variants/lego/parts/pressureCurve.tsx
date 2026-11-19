import { pressureMapping, type PressureCurve } from '@app-game/paint-core/pressureCurve';
import { PressureCurveEditor, type PointEntry } from '@app-game/pressure-calibration';
import { createSignal, Show } from 'solid-js';
import { pressHandlers } from '../../../shared/ui/pressHandlers';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import type { Span } from '../board';
import { referenceCell, useGrid, type Room } from '../grid';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { anyRoom, lookFits, type LookSpec } from '../looks';
import { fits, type TextStyle } from '../textFit';
import { definePart, type PartBinding } from './definition';
import { NumberKeypad, ValueEntryCard } from './ValueEntry';

/** The part's name, on the board and over its graph; declared before the part, which reads it as it is defined. */
const curveLabel = 'Pen pressure';

/** The kind of the pen pressure curve's part. */
export const penPressureKind = 'value:pen-pressure-curve';

/**
 * The pen's pressure curve as a part: the device's calibration, which every brush receives pressure through, edited
 * on the same free-point graph as the Pen pressure window (`PressureCurveEditor`). Every copy, on the board and in the
 * brush studio's Pen page, edits the one curve, so they always agree; edits apply at once to the next stroke. From
 * {@link pressureCurveMinimum} up it is the graph; where a head still leaves the graph that much room, two buttons
 * above it, Measure (the three calibration steps, which run on the brush studio's Pen page, opening the studio there
 * if needed) and Reset (the straight line), with its name before them where the name fits. Smaller, it is a small picture of the curve that opens the graph in a popup. A tap on a
 * point's value above the graph opens the keypad for it. While a pen presses the studio's pad or the graph, a dot
 * shows its raw pressure on the curve, over a histogram of the pressures drawn on the pad.
 */
export const pressureCurvePart = definePart({
  kind: penPressureKind,
  family: 'value',
  group: 'pen',
  section: 'Tools',
  label: curveLabel,
  icon: 'pressure',
  looks: {
    looks: curveLooks(),
    auto: (room) => (lookFits(curveLooks()[1]!, room) ? 'curve' : 'icon')
  },
  needs: curveNeeds,
  View: PressureCurvePart,
  popup: {
    needs: curveNeeds,
    View: (props) => (
      <div class={styles.popupCurve}>
        <PressureCurvePart {...props} look="curve" span={pressureCurveSpan} />
      </div>
    )
  }
});

/**
 * The span a curve takes on the board when it is lifted from the studio: room for its points, its buttons and its
 * name, 188 CSS pixels square at the default cell.
 */
export const pressureCurveSpan: Span = { columns: 6, rows: 6 };

/** The smallest room the graph shows at, where the pen can still tell its points apart. */
export function pressureCurveMinimum(): Room {
  return { width: 140, height: 140 };
}

/** The curve's looks: a picture of it, and the graph. */
function curveLooks(): readonly LookSpec[] {
  return [
    { id: 'icon', label: 'Picture', min: anyRoom },
    { id: 'curve', label: 'Curve', min: pressureCurveMinimum() }
  ];
}

/**
 * How `.curveHead` lays out: two `referenceCell` press areas less 8 px as buttons, 4 px apart and from the top, the
 * caption 10 px in from the left in the editor's semibold type.
 */
const curveButton = referenceCell - 8;
const curveHeadHeight = 4 + curveButton;
const curveHeadChrome = 10 + 2 * (4 + curveButton) + 4;
const curveCaptionStyle: TextStyle = { size: 13, weight: 600 };

/** The graph, or the small picture of the curve that opens it, and the keypad a point's value opens. */
function PressureCurvePart(props: ReturnType<typeof curveNeeds>) {
  const grid = useGrid();
  const [entry, setEntry] = createSignal<{ entry: PointEntry; anchor: Element }>();
  const open = pressHandlers({
    tap: (press) => props.onOpen(press.target)
  });
  /** The keypad's key handler, which it hands over as it is made; see `NumberKeypad`'s `keys`. */
  let keypadKeys: ((event: KeyboardEvent) => boolean) | undefined;

  return (
    <div class={styles.curvePart} data-calibrated={props.calibrated ? '' : undefined}>
      <Show
        when={props.look === 'curve'}
        fallback={
          <div class={styles.curvePicture} role="button" tabindex={0} aria-label={props.label} {...open}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={props.picture} />
            </svg>
          </div>
        }
      >
        <Show when={grid.length(props.span.rows) - curveHeadHeight >= pressureCurveMinimum().height}>
          <div class={styles.curveHead}>
            <span class={styles.curveCaption}>
              <Show when={fits(props.label, curveCaptionStyle, grid.length(props.span.columns) - curveHeadChrome)}>
                {props.label}
              </Show>
            </span>
            <button
              type="button"
              class={styles.curveButton}
              aria-label="Measure pen pressure"
              title="Measure"
              onClick={() => props.onMeasure()}
            >
              <SketchIcon name="pressure" size={20} />
            </button>
            <button
              type="button"
              class={styles.curveButton}
              aria-label="Reset pen pressure"
              title="Reset"
              disabled={!props.calibrated}
              onClick={() => props.onReset()}
            >
              <SketchIcon name="reset" size={20} />
            </button>
          </div>
        </Show>
        <PressureCurveEditor
          class={styles.curveEditor}
          curve={props.curve}
          measured={props.measured}
          marker={props.marker}
          onChange={props.onChange}
          onEntry={(next, anchor) => setEntry({ entry: next, anchor })}
        />
      </Show>
      <Show when={entry()}>
        {(shown) => (
          <ValueEntryCard
            anchor={shown().anchor}
            label={shown().entry.label}
            onCancel={() => setEntry(undefined)}
            onKey={(event) => keypadKeys?.(event) ?? false}
          >
            <NumberKeypad
              label={shown().entry.label}
              value={shown().entry.value}
              min={shown().entry.min}
              max={shown().entry.max}
              step={1}
              unit="%"
              onCommit={(value) => {
                const { set } = shown().entry;
                setEntry(undefined);
                set(value);
              }}
              onCancel={() => setEntry(undefined)}
              keys={(handler) => (keypadKeys = handler)}
            />
          </ValueEntryCard>
        )}
      </Show>
    </div>
  );
}

/** The pen's curve and its commands, guarded by the frame, and the popup the small picture opens. */
function curveNeeds(services: LegoServices, frame: PartBinding) {
  const { pen } = services;

  return {
    label: curveLabel,
    get span() {
      return frame.span;
    },
    get look() {
      return frame.look;
    },
    get curve() {
      return pen.curve();
    },
    get calibrated() {
      return pen.calibrated();
    },
    get measured() {
      return pen.measured();
    },
    get marker() {
      return pen.marker();
    },
    /** The small picture's path. */
    get picture() {
      return curvePicture(pen.curve());
    },
    onChange: frame.command((curve: PressureCurve) => pen.save(curve)),
    onMeasure: frame.command(() => pen.measure()),
    onReset: frame.command(() => pen.reset()),
    onOpen: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
  };
}

/** `curve` as an SVG path in a 100 × 100 box, up being 0, drawn with `preserveAspectRatio="none"` to fill any box. */
export function curvePicture(curve: PressureCurve) {
  const map = pressureMapping(curve);
  return Array.from({ length: pictureSamples + 1 }, (_, step) => {
    const raw = step / pictureSamples;
    return `${step ? 'L' : 'M'}${(raw * 100).toFixed(2)} ${(100 - map(raw) * 100).toFixed(2)}`;
  }).join(' ');
}

/** Points the small picture is drawn through. */
const pictureSamples = 48;
