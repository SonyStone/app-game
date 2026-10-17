import { Show } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { withHue } from '../../features/color/toneLock';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './ColorPanel.module.css';
import { InfiniteIcon } from './icons';

/**
 * Infinite Painter's standard HSB color wheel: a hue ring around a saturation (left to right) and brightness (bottom
 * to top) square. A press on the ring turns the hue there and drags it, a press in the square moves the main pointer;
 * `onEdit` follows the press and `onCommit` receives the color where it lifts. The main pointer's ring shows the
 * `previous` color and its fill the current one; a small marker on the ring points at the complementary hue (as RGB
 * defines it).
 *
 * A tap on the hue pointer calls `onToneLock`. While `toneLock` is on, the pointer shows a sun, and turning the hue
 * keeps the tone (perceived lightness) of the color the press started from, adjusting saturation and brightness.
 */
export function HsbWheel(props: {
  hsv: Hsv;
  color: string;
  previous: string;
  toneLock: boolean;
  onToneLock: () => void;
  /** The wheel's new coordinates and the color they make; with Tone Lock, not `hsvToHex(hsv)` exactly. */
  onEdit: (hsv: Hsv, hex: string) => void;
  onCommit: (color: string) => void;
}) {
  /** What the press in progress edits, chosen where it started; `pointer` starts on the hue pointer. */
  let part: 'pointer' | 'hue' | 'square' = 'square';
  /** The color when the press started, which Tone Lock keeps the tone of. */
  let anchor = '';
  /** The color the press last made, committed when it lifts; empty until the press edits. */
  let last = '';

  /** The press's offset from the wheel's center, in the wheel's unscaled pixels. */
  const offset = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const unit = wheelSize / rect.width;
    return {
      dx: (press.point.x - (rect.left + rect.width / 2)) * unit,
      dy: (press.point.y - (rect.top + rect.height / 2)) * unit
    };
  };
  const edit = (hsv: Hsv, hex: string) => {
    last = hex;
    props.onEdit(hsv, hex);
  };
  const apply = (press: Press) => {
    const { dx, dy } = offset(press);
    if (part === 'square') {
      const s = clamp((dx + squareHalf) / (squareHalf * 2));
      const v = clamp(1 - (dy + squareHalf) / (squareHalf * 2));
      const hsv = { h: props.hsv.h, s, v };
      edit(hsv, hsvToHex(hsv));
      return;
    }

    const h = ((((Math.atan2(-dy, dx) * 180) / Math.PI) % 360) + 360) % 360;
    if (props.toneLock) {
      const hex = withHue(anchor, h);
      edit({ ...hexToHsv(hex, props.hsv), h }, hex);
      return;
    }

    const hsv = { ...props.hsv, h };
    edit(hsv, hsvToHex(hsv));
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      const { dx, dy } = offset(started);
      const pointer = huePoint(props.hsv.h, ringMiddle);
      anchor = props.color;
      last = '';
      if (Math.hypot(dx - pointer.x, dy - pointer.y) <= pointerReach) {
        part = 'pointer';
        return;
      }

      part = Math.hypot(dx, dy) >= ringInner - ringSlack ? 'hue' : 'square';
      apply(started);
    },
    move: apply,
    tap: () => {
      if (part === 'pointer') {
        props.onToneLock();
        return;
      }

      props.onCommit(last);
    },
    end: () => {
      if (last) {
        props.onCommit(last);
      }
    }
  });
  const hue = () => huePoint(props.hsv.h, ringMiddle);
  const complement = () => huePoint(props.hsv.h + 180, ringMiddle);

  return (
    <div
      class={styles.wheel}
      role="group"
      aria-label="HSB color wheel"
      style={{ width: `${wheelSize}px`, height: `${wheelSize}px`, '--ring-width': `${ringWidth}px` }}
      {...press}
    >
      <span class={styles.ring} />
      <span
        class={styles.square}
        style={{
          width: `${squareHalf * 2}px`,
          height: `${squareHalf * 2}px`,
          '--hue': hsvToHex({ h: props.hsv.h, s: 1, v: 1 })
        }}
      />
      <span
        class={styles.complement}
        style={{ left: `calc(50% + ${complement().x}px)`, top: `calc(50% + ${complement().y}px)` }}
      />
      <span
        class={styles.huePointer}
        role="switch"
        aria-checked={props.toneLock ? 'true' : 'false'}
        aria-label="Tone Lock: tap the hue pointer"
        title={props.toneLock ? 'Tone Lock on · tap to turn off' : 'Tap to lock the tone'}
        data-locked={props.toneLock ? '' : undefined}
        style={{ left: `calc(50% + ${hue().x}px)`, top: `calc(50% + ${hue().y}px)` }}
      >
        <Show when={props.toneLock}>
          <InfiniteIcon name="sun" size={14} />
        </Show>
      </span>
      <span
        class={styles.mainPointer}
        style={{
          left: `calc(50% + ${(props.hsv.s * 2 - 1) * squareHalf}px)`,
          top: `calc(50% + ${(1 - props.hsv.v * 2) * squareHalf}px)`,
          background: props.color,
          'border-color': props.previous
        }}
      />
    </div>
  );
}

/** The wheel's diameter, the ring's width and half the square's side, in CSS pixels. */
const wheelSize = 244;
const ringWidth = 26;
const squareHalf = 63;
const ringInner = wheelSize / 2 - ringWidth;
const ringMiddle = wheelSize / 2 - ringWidth / 2;
/** How far inside the ring a press still turns the hue, and how near the hue pointer a press takes the pointer. */
const ringSlack = 6;
const pointerReach = 15;

/** Where hue `h` lies on a circle of `radius`: red at the right, hue rising counterclockwise, as in the manual. */
function huePoint(h: number, radius: number) {
  const angle = (h * Math.PI) / 180;
  return { x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
