import { createEffect, Show } from 'solid-js';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { galleryUi, type Summon } from '../../kit/variant';
import { modes, type DialModel } from './createDialModel';
import styles from './Dial.module.css';
import { arcPath, ticksPath } from './geometry';
import { Glyph } from './Glyph';
import { makeWheelSteps } from './input';

/**
 * The dial at rest: a 56 px handle that stays on screen while the variant is closed, showing the current mode and
 * its value. A tap opens the full dial there; a press-drag moves the handle; the wheel over it turns the current mode
 * without opening, as a Surface Dial on the desk does. It is the fingers' way in, besides the long press.
 */
export function MiniDial(props: {
  studio: Studio;
  model: DialModel;
  /** The handle's center in client pixels. */
  at: Point;
  /** The handle is being dragged to `to`. */
  onMove: (to: Point) => void;
  /** The drag ended at the handle's current place, for remembering it. */
  onPark: () => void;
  onOpen: (at: Point, pointerType: Summon['pointerType']) => void;
}) {
  let indicator: SVGLineElement | undefined;
  let face: SVGSVGElement | undefined;
  let grabbed: Point = { x: 0, y: 0 };
  const wheelSteps = makeWheelSteps();
  const mode = () => modes.find((entry) => entry.id === props.model.mode())!;
  const track = () => props.model.track();
  const angle = () => {
    const at = track().at;
    if (at === undefined) {
      return undefined;
    }

    return track().shape === 'circle' ? at * 360 : -135 + at * 270;
  };
  const press = pressHandlers({
    start(started: Press) {
      grabbed = { x: started.start.x - props.at.x, y: started.start.y - props.at.y };
    },
    move(moving: Press) {
      if (moving.moved) {
        props.onMove({ x: moving.point.x - grabbed.x, y: moving.point.y - grabbed.y });
      }
    },
    end: () => props.onPark(),
    tap: (tapped: Press) => props.onOpen(props.at, tapped.pointerType)
  });

  createEffect(
    () => props.model.feedback(),
    (event, previous) => {
      if (!previous) {
        return;
      }

      if (event.kind === 'tick') {
        indicator?.animate([{ strokeWidth: '4.5' }, { strokeWidth: '2' }], { duration: 160, easing: 'ease-out' });
      } else {
        face?.animate(
          [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(4deg)' },
            { transform: 'rotate(-3deg)' },
            { transform: 'rotate(0deg)' }
          ],
          { duration: 150 }
        );
      }
    }
  );

  return (
    <div
      {...galleryUi}
      {...press}
      class={styles.mini}
      style={{ left: `${props.at.x - 28}px`, top: `${props.at.y - 28}px` }}
      title={`Dial · ${mode().label}: tap to open, drag to move, wheel to turn`}
      onWheel={(event) => {
        event.preventDefault();
        props.model.step(wheelSteps(event), { x: innerWidth / 2, y: innerHeight / 2 });
      }}
    >
      <svg ref={face} viewBox="-28 -28 56 56" width="56" height="56" aria-hidden="true">
        <circle class={styles.miniDisc} r={27.5} />
        <g class={styles.miniKnob} transform={`rotate(${Math.round(props.model.knurl() * 10) / 10})`}>
          <path d={miniKnob} />
        </g>
        <Show when={track().shape === 'arc'} fallback={<circle class={styles.miniRail} r={20} />}>
          <path class={styles.miniRail} d={arcPath(20, -135, 135)} />
        </Show>
        <Show when={track().level && track().shape === 'arc' && (track().at ?? 0) > 0.004}>
          <path class={styles.miniLevel} d={arcPath(20, -135, angle() ?? -135)} />
        </Show>
        <Show when={angle() !== undefined}>
          <line
            ref={indicator}
            class={styles.miniIndicator}
            transform={`rotate(${Math.round((angle() ?? 0) * 10) / 10})`}
            y1={-17}
            y2={-23.5}
          />
        </Show>
      </svg>
      <span class={styles.miniIcon}>
        <Glyph name={mode().icon} size={13} />
      </span>
      <span class={styles.miniValue}>
        {props.model.readout().value}
        <small>{props.model.readout().unit}</small>
      </span>
    </div>
  );
}

/** The handle's knob: 24 fine ticks around the rim. */
const miniKnob = ticksPath(
  Array.from({ length: 24 }, (_, index) => index * 15),
  24,
  26.5
);
