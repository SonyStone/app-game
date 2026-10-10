import { createSignal, For } from 'solid-js';
import type { Side } from './geometry';
import styles from './GuideCard.module.css';

/**
 * The card that explains the free hand's zone, beside the zone and pointing at it: what one, two and three fingers do
 * there, and the mouse and keyboard path. Shown on the first visit until dismissed; see `createGuideSeen`.
 */
export function GuideCard(props: {
  side: Side;
  /** The zone's width and the height of its middle, in stage pixels, which the card points at. */
  zone: { width: number; cy: number };
  onDismiss: () => void;
}) {
  return (
    <div
      class={styles.card}
      data-side={props.side}
      data-hands-ui
      role="dialog"
      aria-labelledby="hands-guide-title"
      style={{ [props.side]: `${props.zone.width + 16}px`, top: `${props.zone.cy}px` }}
    >
      <h2 id="hands-guide-title">Your free hand holds the tools</h2>
      <p class={styles.lead}>
        The pen only draws. Your other hand works in the shaded area along the {props.side} edge; touches there never
        pan or paint.
      </p>
      <dl class={styles.gestures}>
        <For each={gestures}>
          {(gesture) => (
            <>
              <dt>{gesture[0]}</dt>
              <dd>{gesture[1]}</dd>
            </>
          )}
        </For>
      </dl>
      <p class={styles.note}>
        Elsewhere on the drawing, fingers pan, pinch and rotate; two fingers tap to undo, three to redo. Mouse: right-click
        or hold Space for the same ring; keys B, E, I and L choose tools.
      </p>
      <button class={styles.dismiss} onClick={() => props.onDismiss()}>
        Got it
      </button>
    </div>
  );
}

/**
 * Whether the guide card was dismissed on this device, stored in `localStorage`; storage failures keep the answer for
 * this session.
 */
export function createGuideSeen() {
  const [seen, setSeen] = createSignal(readSeen());

  return {
    seen,
    dismiss() {
      setSeen(true);
      try {
        localStorage.setItem(guideKey, 'seen');
      } catch {
        // Remembered for this session.
      }
    },
    /** Shows the card again. */
    show: () => setSeen(false)
  };
}

function readSeen() {
  try {
    return localStorage.getItem(guideKey) === 'seen';
  } catch {
    return false;
  }
}

const guideKey = 'paint.hands.guide';

/** What the fingers do in the zone: the gesture, then its effect. */
const gestures: readonly (readonly [string, string])[] = [
  ['Touch, slide, hold', 'A ring of tools opens under your finger. Slide onto one and keep holding: the pen is that tool until you lift.'],
  ['Flick or tap', 'Flick onto a tool, or tap and then tap a tool, to keep it.'],
  ['Hold still', 'A color disc opens under the finger. Slide to choose, lift to keep.'],
  ['Two fingers', 'Drag up or down for the brush size, sideways for opacity. Tap to undo.'],
  ['Three fingers', 'Tap for the layers, brushes and file.']
];
