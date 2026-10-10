import { createEffect, createSignal, For } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { discColor, discPoint, paintDisc } from '../../shared/ui/colorDisc';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './panels.module.css';

/**
 * The color disc and the color history, opened from the dock's current color: a hue ring around a saturation and
 * brightness disc, the second color to swap with (as X does) and the recently used colors. Dragging on the disc
 * changes the color live and remembers it when the press lifts, keeping the panel open; choosing a recent color
 * finishes.
 */
export function ColorPanel(props: {
  /** The current color, `#rrggbb`. */
  color: string;
  secondary: string;
  recent: readonly string[];
  onColor: (hex: string) => void;
  /** Remembers a color that a drag ended on or a tap chose. */
  onCommit: (hex: string) => void;
  onSwap: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <header class={styles.header}>
        <h2>Color</h2>
        <button
          class={[styles.swatch, styles.secondary]}
          style={{ background: props.secondary }}
          aria-label="Second color: swap with the current color"
          title="Second color · tap to swap (X)"
          onClick={() => props.onSwap()}
        />
        <span class={styles.swatch} style={{ background: props.color }} role="img" aria-label="Current color" />
      </header>
      <Disc color={props.color} onColor={props.onColor} onCommit={props.onCommit} />
      <h3 class={styles.subheading}>Recent</h3>
      <div class={styles.chips}>
        <For each={props.recent.slice(0, recentSlots)}>
          {(hex) => (
            <button
              class={styles.chip}
              data-current={hex === props.color ? '' : undefined}
              style={{ background: hex }}
              aria-label={hex}
              title={hex}
              onClick={() => {
                props.onColor(hex);
                props.onCommit(hex);
                props.onDone();
              }}
            />
          )}
        </For>
        {/* Places for colors not used yet keep the row's rhythm. */}
        <For each={Array.from({ length: Math.max(0, recentSlots - props.recent.length) })}>
          {() => <span class={[styles.chip, styles.unused]} />}
        </For>
      </div>
    </>
  );
}

/** Recent colors shown, one row. */
const recentSlots = 8;

/**
 * The disc: a press on the ring turns the hue, inside it picks saturation and brightness; the color follows the
 * press, `onCommit` gets it when the press lifts, and a cancelled press restores the color from before. Keeps its own
 * HSV while the color matches it, so that greys and black keep the hue they were dragged from.
 */
function Disc(props: { color: string; onColor: (hex: string) => void; onCommit: (hex: string) => void }) {
  let canvas!: HTMLCanvasElement;
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  /** What the press in progress edits, chosen where it started. */
  let part: 'hue' | 'disc' = 'disc';
  let before = '';
  /** The color this press set last; `props.color` read in the same event would still be the old one. */
  let latest = '';

  createEffect(
    () => hsv().h,
    (hue) => {
      const frame = requestAnimationFrame(() =>
        paintDisc(canvas, hue, Math.round(innerRadius * 2 * Math.min(2, devicePixelRatio || 1)))
      );
      return () => cancelAnimationFrame(frame);
    }
  );

  const offset = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const unit = discSize / rect.width;
    return {
      dx: (press.point.x - (rect.left + rect.width / 2)) * unit,
      dy: (press.point.y - (rect.top + rect.height / 2)) * unit
    };
  };
  const apply = (press: Press) => {
    const { dx, dy } = offset(press);
    const current = hsv();
    let next: Hsv;
    if (part === 'hue') {
      next = { ...current, h: ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360 };
    } else {
      const { saturation, value } = discColor(dx / innerRadius, dy / innerRadius);
      next = { ...current, s: saturation, v: value };
    }

    setHsv(next);
    latest = hsvToHex(next);
    props.onColor(latest);
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      const { dx, dy } = offset(started);
      part = Math.hypot(dx, dy) >= innerRadius + ringGap / 2 ? 'hue' : 'disc';
      before = props.color;
      apply(started);
    },
    move: apply,
    end: () => props.onCommit(latest),
    tap: () => props.onCommit(latest),
    cancel: () => props.onColor(before)
  });
  const hueThumb = () => {
    const angle = (hsv().h * Math.PI) / 180;
    return { x: Math.sin(angle) * ringMiddle, y: -Math.cos(angle) * ringMiddle };
  };
  const discThumb = () => {
    const { u, v } = discPoint(hsv().s, hsv().v);
    return { x: u * innerRadius, y: v * innerRadius };
  };

  return (
    <div class={styles.disc} role="group" aria-label="Color disc" {...press}>
      <span class={styles.ring} />
      <span class={styles.inner}>
        <canvas ref={canvas} />
      </span>
      <span
        class={styles.thumb}
        style={{
          left: `calc(50% + ${hueThumb().x}px)`,
          top: `calc(50% + ${hueThumb().y}px)`,
          background: hsvToHex({ h: hsv().h, s: 1, v: 1 })
        }}
      />
      <span
        class={[styles.thumb, styles.discThumb]}
        style={{
          left: `calc(50% + ${discThumb().x}px)`,
          top: `calc(50% + ${discThumb().y}px)`,
          background: props.color
        }}
      />
    </div>
  );
}

/** The disc's diameter, the ring's width and the gap between the ring and the inner disc, in CSS pixels. */
const discSize = 200;
const ringWidth = 22;
const ringGap = 6;
const innerRadius = discSize / 2 - ringWidth - ringGap;
const ringMiddle = discSize / 2 - ringWidth / 2;
