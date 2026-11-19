import { For, Show } from 'solid-js';
import styles from './PressureCalibration.module.css';

/** The kinds of stroke the measuring steps ask for, each shown by its line's weight; see `PressureCalibration`. */
export type StrokeWeight = 'normal' | 'hard' | 'light';

/**
 * A step's pictogram: a short stroke as heavy as the step asks for, which fills along its length with `progress`
 * (0 to 1), so the current step shows how much is still wanted and finished steps show full lines.
 */
export function StrokeGlyph(props: { weight: StrokeWeight; progress: number }) {
  return (
    <svg class={styles.glyph} viewBox="0 0 64 28" aria-hidden="true">
      <path class={styles.glyphTrack} d={glyphPath} stroke-width={glyphWidth[props.weight]} />
      <path
        class={styles.glyphFill}
        d={glyphPath}
        pathLength={1}
        stroke-width={glyphWidth[props.weight]}
        stroke-dasharray={`${Math.max(0, Math.min(1, props.progress))} 2`}
        opacity={props.progress > 0 ? 1 : 0}
      />
    </svg>
  );
}

/**
 * The step's stroke demonstrated in a loop: a pen tip runs along a gentle curve and leaves a line as heavy as the step
 * asks for, then the line fades and the pen starts again. With reduced motion it is the finished line, still.
 */
export function StrokeHint(props: { weight: StrokeWeight; label: string }) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <svg class={styles.hint} viewBox="0 0 240 72" role="img" aria-label={props.label} data-weight={props.weight}>
      <path class={styles.hintGuide} d={hintPath} />
      <path class={styles.hintLine} d={hintPath} pathLength={1} stroke-width={hintWidth[props.weight]}>
        <Show when={!still}>
          <animate
            attributeName="stroke-dashoffset"
            values="1;0;0"
            keyTimes="0;0.7;1"
            dur={hintDuration}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.86;1"
            dur={hintDuration}
            repeatCount="indefinite"
          />
        </Show>
      </path>
      <Show when={!still}>
        <g class={styles.hintPen}>
          <animateMotion
            path={hintPath}
            keyPoints="0;1;1"
            keyTimes="0;0.7;1"
            calcMode="linear"
            dur={hintDuration}
            repeatCount="indefinite"
          />
          <circle class={styles.hintPress} r={hintWidth[props.weight] / 2 + 5} />
          <path class={styles.hintNib} d="M0 0 L5 -9 L28 -40 L36 -34 L13 -3 Z" />
        </g>
      </Show>
    </svg>
  );
}

/**
 * Shown while the latest contact was not a pen: a pen, marked as wanted, beside the pointer that was used (`type`,
 * such as `mouse` or `touch`), struck through.
 */
export function PenNeeded(props: { type: string }) {
  return (
    <div class={styles.penNeeded} role="status">
      <svg viewBox="0 0 140 64" role="img" aria-label="Pen only">
        <g class={styles.penWanted}>
          <path d="M20 54 L26 40 L50 12 L58 19 L34 47 Z" />
          <path d="M20 54 L26 40 L34 47 Z" class={styles.penTip} />
        </g>
        <path class={styles.penCheck} d="M44 50 l6 6 l12 -14" />
        <g class={styles.pointerRefused}>
          <Show
            when={props.type === 'mouse'}
            fallback={
              <>
                <rect x="104" y="8" width="13" height="34" rx="6.5" />
                <path d="M96 36 h32 v10 a12 12 0 0 1 -12 12 h-8 a12 12 0 0 1 -12 -12 Z" />
              </>
            }
          >
            <rect x="96" y="12" width="28" height="44" rx="14" />
            <path d="M110 12 v14" />
          </Show>
          <path class={styles.strike} d="M88 10 L134 58" />
        </g>
      </svg>
    </div>
  );
}

/**
 * The raw pressures measured so far as a histogram across the pen's range, one colour per step, stacked; under its
 * baseline a wedge from thin to heavy tells light pressure from firm. `groups` are each step's pressures.
 */
export function PressureStrip(props: { groups: readonly { weight: StrokeWeight; pressures: readonly number[] }[] }) {
  const columns = () => {
    const counts = props.groups.map(({ weight, pressures }) => {
      const bins = Array<number>(stripBins).fill(0);
      for (const pressure of pressures) {
        bins[Math.max(0, Math.min(stripBins - 1, Math.floor(pressure * stripBins)))]!++;
      }

      return { weight, bins };
    });
    const highest = Math.max(1, ...Array.from({ length: stripBins }, (_, bin) => sumAt(counts, bin)));
    return Array.from({ length: stripBins }, (_, bin) => {
      let bottom = 0;
      return counts.map(({ weight, bins }) => {
        const height = (bins[bin]! / highest) * stripHeight;
        const bar = { weight, y: stripHeight - bottom - height, height };
        bottom += height;
        return bar;
      });
    });
  };

  return (
    <svg class={styles.strip} viewBox={`0 0 ${stripBins * 5} ${stripHeight + 10}`} role="img" aria-label="Pressure">
      <For each={columns()} keyed={false}>
        {(bars, bin) => (
          <For each={bars()} keyed={false}>
            {(bar) => (
              <Show when={bar().height > 0}>
                <rect
                  class={styles.stripBar}
                  data-weight={bar().weight}
                  x={bin * 5 + 0.5}
                  y={bar().y}
                  width={4}
                  height={bar().height}
                />
              </Show>
            )}
          </For>
        )}
      </For>
      <path
        class={styles.stripWedge}
        d={`M0 ${stripHeight + 4} L${stripBins * 5} ${stripHeight + 1} V${stripHeight + 9} Z`}
      />
    </svg>
  );
}

/** The icons of the steps' buttons, drawn on a 24 × 24 grid in the current colour. */
export function Icon(props: { name: keyof typeof iconPaths }) {
  return (
    <svg class={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[props.name]} />
    </svg>
  );
}

const iconPaths = {
  back: 'M15 5 L8 12 L15 19',
  next: 'M9 5 L16 12 L9 19',
  finish: 'M5 12.5 L10 17.5 L19 7',
  cancel: 'M6 6 L18 18 M18 6 L6 18',
  again: 'M19 12 a7 7 0 1 1 -2.05 -4.95 M19 4 v4.5 h-4.5',
  reset: 'M5 19 L19 5'
};

function sumAt(counts: readonly { bins: readonly number[] }[], bin: number) {
  return counts.reduce((sum, { bins }) => sum + bins[bin]!, 0);
}

const glyphPath = 'M8 19 C 18 6, 30 24, 40 14 S 52 8, 56 9';
const glyphWidth = { light: 1.5, normal: 4, hard: 8 } satisfies Record<StrokeWeight, number>;
const hintPath = 'M24 50 C 64 10, 104 66, 144 36 S 204 22, 216 26';
const hintWidth = { light: 2, normal: 7, hard: 15 } satisfies Record<StrokeWeight, number>;
const hintDuration = '2.6s';
const stripBins = 40;
const stripHeight = 36;
