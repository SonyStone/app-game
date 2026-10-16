import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import styles from './ComponentCanvas.module.css';

/**
 * A see-through silhouette of a hand holding a pen, its pen tip on the pen's hover, to show what the palm covers
 * while the pen works a component. `hand` mirrors it, as palm rejection's hand setting says which hand holds the pen.
 *
 * It appears once a pen hovers and stays while it touches, and goes when the pen leaves the hover range; a pen whose
 * hover Chrome has lost never shows it. Its size is a real hand's on the MovinkPad (see `cssPixelsPerMm`), whatever
 * the canvas's zoom: the hand is in the room, not on the canvas.
 */
export function HandGhost(props: { hand: 'left' | 'right' }) {
  const [shown, setShown] = createSignal(false);
  let ghost!: HTMLDivElement;
  let frame: number | undefined;
  let at = { x: 0, y: 0 };
  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  const place = () => {
    frame = undefined;
    ghost.style.transform = `translate(${at.x}px, ${at.y}px) scale(${props.hand === 'left' ? -1 : 1}, 1)`;
  };

  createEventListener(
    window,
    'pointermove',
    (event) => {
      if (event.pointerType !== 'pen') {
        return;
      }

      if (event.buttons === 0) {
        setShown(true);
      }

      at = { x: event.clientX, y: event.clientY };
      frame ??= requestAnimationFrame(place);
    },
    { capture: true, passive: true }
  );
  // The pen leaving the hover range leaves the window.
  createEventListener(
    window,
    'pointerout',
    (event) => {
      if (event.pointerType === 'pen' && event.relatedTarget === null) {
        setShown(false);
      }
    },
    { capture: true, passive: true }
  );

  return (
    <div ref={ghost} class={styles.handGhost} data-shown={shown() ? 'true' : 'false'} aria-hidden="true">
      <svg
        width={handBox.width * cssPixelsPerMm}
        height={handBox.height * cssPixelsPerMm}
        viewBox={`${handBox.x} ${handBox.y} ${handBox.width} ${handBox.height}`}
        style={{ left: `${handBox.x * cssPixelsPerMm}px`, top: `${handBox.y * cssPixelsPerMm}px` }}
      >
        <path class={styles.handPen} d={penPath} />
        <path class={styles.handPalm} d={handPath} />
      </svg>
    </div>
  );
}

/**
 * CSS pixels per millimetre on the MovinkPad: 2880 × 1800 px at 280 dpi with a device pixel ratio of 1.75 makes
 * 160 CSS px per inch. Browsers report no physical size, so other screens show the same CSS size.
 */
const cssPixelsPerMm = 280 / 1.75 / 25.4;

/**
 * A right hand from above, in millimetres from the pen's tip (x right, y down): the index finger on the pen just
 * above the tip, the back of the hand up and to the right, the curled fingers and the heel of the palm resting below
 * and to the right, and the wrist leaving at the bottom right.
 */
const handPath =
  'M4 -6C10 -22 30 -38 52 -40C72 -42 92 -30 104 -12C118 8 124 34 128 62L152 124L100 134' +
  'C92 98 80 76 62 64C44 54 26 46 20 32C16 22 12 12 4 -6Z';

/** The pen, from its tip up and to the right, about 135 mm long. */
const penPath = 'M0 0L3 -6L68 -118L62 -121L-1 -7Z';

/** The drawing's extent in millimetres, from the pen tip. */
const handBox = { x: -4, y: -124, width: 160, height: 262 };
