import { createSignal, For } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { angleOf, disc, polar, spokePath, wrap } from './geometry';
import styles from './Orbit.module.css';
import { tappable } from './tapPress';

/**
 * The disc's rim, Krita's canvas rotation ring: a track with a tick every 15° and a handle at the view's angle.
 * Press-drag anywhere along it turns the canvas live by the angle swept around the disc (Shift snaps the result to
 * 15°); a double tap resets to 0°. Renders into the Orbit's SVG scene; `onRotating` reports a drag in progress, so
 * that the rest of the UI can step aside. The wheel over the rim turns 5° per notch (handled by the Orbit).
 */
export function RotationRim(props: {
  studio: Studio;
  toLocal: (client: Point) => Point;
  onRotating: (on: boolean) => void;
}) {
  const [rotating, setRotating] = createSignal(false);
  const angle = () => props.studio.view().angle;
  const handle = () => polar(angle(), disc.track);
  const readout = () => polar(angle() + 14, disc.track);
  let drag: { start: number; last: number; swept: number } | undefined;
  let lastTap = -Infinity;

  const finish = () => {
    drag = undefined;
    setRotating(false);
    props.onRotating(false);
  };
  const press = pressHandlers({
    start: (press) => {
      const at = angleOf(props.toLocal(press.point));
      drag = { start: props.studio.view().angle, last: at, swept: 0 };
    },
    move: (press) => {
      if (!drag) {
        return;
      }

      const at = angleOf(props.toLocal(press.point));
      drag.swept += wrap(at - drag.last);
      drag.last = at;
      if (!press.moved) {
        return;
      }

      setRotating(true);
      props.onRotating(true);
      const target = drag.start + drag.swept;
      props.studio.rotateTo(press.shift ? Math.round(target / 15) * 15 : target);
    },
    end: finish,
    cancel: finish,
    tap: (press) => {
      finish();
      if (press.time - lastTap < doubleTapTime) {
        props.studio.rotateTo(0);
        lastTap = -Infinity;
      } else {
        lastTap = press.time;
      }
    }
  });

  return (
    <g class={[styles.rim, { [styles.rotating!]: rotating() }]} data-part="rim">
      <circle class={styles.rimBand} r={(disc.rimInner + disc.radius) / 2} stroke-width={disc.radius - disc.rimInner} />
      <circle class={styles.rimTrack} r={disc.track} />
      <For each={ticks}>
        {(tick) => (
          <path
            class={tick % 90 === 0 ? styles.majorTick : styles.tick}
            d={spokePath(tick, tick % 90 === 0 ? disc.track + 4 : disc.track + 6, disc.radius - 4)}
          />
        )}
      </For>
      <circle
        ref={tappable}
        class={styles.rimHit}
        {...galleryUi}
        {...press}
        data-wheel="rim"
        r={(disc.rimInner + disc.radius) / 2}
        stroke-width={disc.radius - disc.rimInner}
      >
        <title>Canvas rotation: drag along the rim, Shift snaps 15°, double tap resets</title>
      </circle>
      <path class={styles.rimNeedle} d={spokePath(angle(), disc.rimInner + 1, disc.radius - 1)} />
      <circle class={styles.rimHandle} cx={handle().x} cy={handle().y} r="6.5" />
      <text class={styles.rimReadout} x={readout().x} y={readout().y}>
        {`${Math.round(angle())}°`}
      </text>
    </g>
  );
}

const ticks = Array.from({ length: 24 }, (_, index) => index * 15);
const doubleTapTime = 400;
