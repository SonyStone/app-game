import { createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { discColor, discPoint, paintDisc } from '../../shared/ui/colorDisc';
import { createPickerPixels } from '../../shared/ui/createPickerPixels';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './ZenStudio.module.css';

/**
 * The color disc, after Procreate's: a hue ring around a saturation and brightness disc. A press on the ring turns
 * the hue, one inside it picks saturation and brightness; the color follows the press (`onInput`) and is committed
 * when it lifts (`onCommit`), for the recent colors.
 */
export function ColorDisc(props: {
  color: string;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  let canvas!: HTMLCanvasElement;
  // Keeps its own HSV while the color matches it, so that greys and black keep the hue they were dragged from.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  const hue = createMemo(() => hsv().h);
  const pixels = createPickerPixels(() => canvas);
  /** What the press in progress edits, chosen where it started. */
  let part: 'hue' | 'disc' = 'disc';
  /** The color the press last set; a signal read in the same event would still be the old one. */
  let latest = untrack(() => props.color);

  createEffect(
    () => ({ hue: hue(), pixels: pixels() }),
    (next) => {
      const frame = requestAnimationFrame(() => {
        if (next.pixels > 0) {
          paintDisc(canvas, next.hue, next.pixels);
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  );

  /** The press's offset from the disc's center, in the disc's unscaled pixels. */
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
    const next =
      part === 'hue'
        ? { ...current, h: ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360 }
        : (() => {
            const { saturation, value } = discColor(dx / innerRadius, dy / innerRadius);
            return { ...current, s: saturation, v: value };
          })();
    setHsv(next);
    latest = hsvToHex(next);
    props.onInput(latest);
  };
  // Created once: an inline spread would be re-run, and lose the press, whenever another attribute changes.
  const press = pressHandlers({
    start(started) {
      const { dx, dy } = offset(started);
      part = Math.hypot(dx, dy) >= innerRadius + ringGap / 2 ? 'hue' : 'disc';
      apply(started);
    },
    move: apply,
    end: () => props.onCommit(latest)
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
    <div class={styles.disc} role="group" aria-label="Color disc" data-zen-ui="" {...press}>
      <span class={styles.hueRing} />
      <span class={styles.discInner}>
        <canvas ref={(element) => (canvas = element)} />
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
          background: hsvToHex(hsv())
        }}
      />
    </div>
  );
}

/** The disc's diameter in CSS pixels. */
export const discSize = 216;
const ringWidth = 22;
const ringGap = 7;
const innerRadius = discSize / 2 - ringWidth - ringGap;
const ringMiddle = discSize / 2 - ringWidth / 2;
