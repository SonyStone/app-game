import { createSignal, For, Show } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../../../features/color/hsv';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { angleOf, disc, polar, recentAngle } from './geometry';
import styles from './Orbit.module.css';
import { tappable, tapPress } from './tapPress';

/**
 * The disc's center: a hue ring around a saturation/value square, as Krita's selector draws it. Press-drag on the
 * ring turns the hue (red at 12 o'clock, clockwise), inside the square picks saturation (across) and value (up).
 * Edits apply live; the lift commits the color, so it joins the recent colors. Picking does not close the Orbit.
 */
export function ColorCore(props: { studio: Studio }) {
  // Keeps the edited HSV while it still produces the color, so that the hue survives grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.studio.color() ? previous : hexToHsv(props.studio.color(), previous)
  );
  let part: 'ring' | 'square' | undefined;

  const press = pressHandlers({
    start: (press, event) => {
      const point = local(event, press.target);
      part = partAt(point);
      if (!part) {
        return false;
      }

      edit(point);
    },
    move: (press, event) => edit(local(event, press.target)),
    end: finish,
    cancel: finish
  });

  return (
    <div ref={tappable} class={styles.core} {...galleryUi} {...press} data-part="ui">
      <div class={styles.hueRing} />
      <div
        class={styles.square}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv().h} 100% 50%))`
        }}
      >
        <span
          class={styles.svMarker}
          style={{ left: `${hsv().s * 100}%`, top: `${(1 - hsv().v) * 100}%`, background: props.studio.color() }}
        />
      </div>
      <span class={styles.hueMarker} style={{ transform: `rotate(${hsv().h}deg) translateY(-${hueMiddle}px)` }} />
    </div>
  );

  function edit(point: Point) {
    const current = hsv();
    const next =
      part === 'ring'
        ? { ...current, h: (angleOf(point) + 360) % 360 }
        : {
            ...current,
            s: unit((point.x + half) / disc.square),
            v: unit(1 - (point.y + half) / disc.square)
          };
    setHsv(next);
    props.studio.setColor(hsvToHex(next));
  }

  function finish() {
    if (part) {
      part = undefined;
      props.studio.commitColor();
    }
  }
}

/**
 * The ring between the selector and the presets: the current/previous color dot at 12 o'clock (a tap swaps them) and
 * the recent colors, newest first, clockwise. A recent color's tap paints with it and is a finished action.
 */
export function ColorHistory(props: { studio: Studio; side: 1 | -1; done: () => void }) {
  const dot = () => polar(0, disc.recent);
  // Press handlers keep their press in a closure: create them once, never inside a JSX expression.
  const swapPress = tapPress(() => props.studio.swapColors());

  return (
    <>
      <button
        class={styles.split}
        {...galleryUi}
        {...swapPress}
        data-part="ui"
        title="Current and previous color: tap to swap (X)"
        style={{ left: `${dot().x}px`, top: `${dot().y}px` }}
      >
        <span style={{ background: props.studio.color() }} />
        <span style={{ background: props.studio.previous() }} />
      </button>
      {/* Empty sockets keep every recent color's place fixed while the list fills up. */}
      <For each={sockets}>
        {(index) => {
          const at = () => polar(props.side * recentAngle(index), disc.recent);
          return (
            <Show when={index >= props.studio.recent().length}>
              <span class={styles.socket} data-part="ui" style={{ left: `${at().x}px`, top: `${at().y}px` }} />
            </Show>
          );
        }}
      </For>
      <For each={props.studio.recent()}>
        {(color, index) => {
          const at = () => polar(props.side * recentAngle(index()), disc.recent);
          const press = tapPress(() => {
            props.studio.chooseColor(color);
            props.done();
          });
          return (
            <button
              class={[styles.recent, { [styles.current!]: props.studio.color() === color }]}
              {...galleryUi}
              {...press}
              data-part="ui"
              title={color}
              style={{ left: `${at().x}px`, top: `${at().y}px` }}
            >
              <span style={{ background: color }} />
            </button>
          );
        }}
      </For>
    </>
  );
}

/** The places of the recent colors, twelve as the studio keeps. */
const sockets = Array.from({ length: 12 }, (_, index) => index);

/** The middle of the hue ring's band, where its marker rides. */
const hueMiddle = (disc.hueInner + disc.hueOuter) / 2;
const half = disc.square / 2;

/** The press relative to the element's center in unscaled pixels; the element is the selector's square box. */
function local(event: PointerEvent, element: Element): Point {
  const box = element.getBoundingClientRect();
  const scale = box.width / (disc.hueOuter * 2);
  return {
    x: (event.clientX - box.left - box.width / 2) / scale,
    y: (event.clientY - box.top - box.height / 2) / scale
  };
}

/** Which part a press starts on: the square (with a little slack), the ring band, or neither. */
function partAt(point: Point) {
  if (Math.abs(point.x) <= half + 4 && Math.abs(point.y) <= half + 4) {
    return 'square';
  }

  const distance = Math.hypot(point.x, point.y);
  return distance >= disc.hueInner - 8 && distance <= disc.hueOuter + 4 ? 'ring' : undefined;
}

function unit(value: number) {
  return Math.min(1, Math.max(0, value));
}
