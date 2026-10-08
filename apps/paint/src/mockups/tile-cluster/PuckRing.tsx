import { For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './mockup.module.css';
import { ringActions, sectorAngles, type RingAction, type RingLayout } from './ringLayout';

/**
 * The Puck ring: sectors from `layout` around a dead circle of radius `inner`, out to `outer`, centered on the
 * element's position. `heading` is the sector the pointer points at, lit by `strength` (0–1) as the pointer nears the
 * dead circle's edge; `flash` briefly lights a sector each time an instant function runs. `labels` adds text, such as
 * the zoom percentage, under a function's icon. With `onPointerDown` the ring takes presses; otherwise it lets them
 * through.
 */
export function PuckRing(props: {
  class?: string | undefined;
  layout: RingLayout;
  inner: number;
  outer: number;
  heading?: number | undefined;
  strength?: number;
  flash?: { index: number; count: number } | undefined;
  labels?: Partial<Record<RingAction, string>>;
  /** Functions shown; sectors of others are left empty, so the rest keep their places. All by default. */
  shows?: (action: RingAction) => boolean;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerMove?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  /** Shows each sector's index as a `data-sector` attribute and passes its own presses to `onSectorDown`. */
  onSectorDown?: (index: number, event: PointerEvent) => void;
}) {
  const middle = () => (props.inner + props.outer) / 2;

  return (
    <div
      class={[styles.ring, props.class, { [styles.ringInteractive!]: !!props.onPointerDown || !!props.onSectorDown }]}
      style={{ width: `${props.outer * 2}px`, height: `${props.outer * 2}px` }}
      data-ring
      onPointerDown={(event) => props.onPointerDown?.(event)}
      onPointerMove={(event) => props.onPointerMove?.(event)}
      onPointerUp={(event) => props.onPointerUp?.(event)}
      onPointerCancel={(event) => props.onPointerUp?.(event)}
    >
      <svg
        width={props.outer * 2}
        height={props.outer * 2}
        viewBox={`${-props.outer} ${-props.outer} ${props.outer * 2} ${props.outer * 2}`}
        aria-hidden="true"
      >
        {/* Keyed by position, so that a sector keeps its element, and any press it captured, when the layout changes. */}
        <For each={sectorAngles(props.layout)} keyed={false}>
          {(sector) => (
            <Show when={props.shows?.(sector().action) ?? true}>
              <path
                class={[
                  styles.ringSector,
                  {
                    [styles.ringFlash!]: props.flash?.index === sector().index && props.flash.count % 2 === 0,
                    [styles.ringFlashAgain!]: props.flash?.index === sector().index && props.flash.count % 2 === 1
                  }
                ]}
                style={{ '--lit': props.heading === sector().index ? (props.strength ?? 1) : 0 }}
                data-sector={sector().index}
                d={sectorPath(sector().from + ringGap, sector().to - ringGap, props.inner, props.outer)}
                onPointerDown={(event) => {
                  if (props.onSectorDown) {
                    event.stopPropagation();
                    props.onSectorDown(sector().index, event);
                  }
                }}
              />
            </Show>
          )}
        </For>
        <circle class={styles.ringDead} r={Math.max(1, props.inner - 1)} />
        <circle class={styles.ringDot} r={2.5} />
      </svg>
      <For each={sectorAngles(props.layout)} keyed={false}>
        {(sector) => {
          const spot = () => polar((sector().from + sector().to) / 2, middle());
          const action = () => ringActions[sector().action];
          return (
            <Show when={props.shows?.(sector().action) ?? true}>
              <span
                class={styles.ringLabel}
                style={{ left: `${props.outer + spot().x}px`, top: `${props.outer + spot().y}px` }}
              >
                <SketchIcon name={action().icon} size={sector().to - sector().from < 45 ? 14 : 20} />
                <Show when={props.labels?.[sector().action]}>{(text) => <small>{text()}</small>}</Show>
              </span>
            </Show>
          );
        }}
      </For>
    </div>
  );
}

/** Degrees left empty on each side of a sector, so that sectors read as separate buttons. */
const ringGap = 1.5;

/** The point at a screen angle (degrees, clockwise from the right) and radius from the center. */
export function polar(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

/** The SVG path of the annular sector between angles `from` and `to` (degrees) and radii `inner` and `outer`. */
function sectorPath(from: number, to: number, inner: number, outer: number) {
  const point = (angle: number, radius: number) => {
    const { x, y } = polar(angle, radius);
    return `${x} ${y}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return [
    `M ${point(from, outer)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(to, outer)}`,
    `L ${point(to, inner)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(from, inner)}`,
    'Z'
  ].join(' ');
}
