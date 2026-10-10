import type { JSX } from '@solidjs/web';
import { penModeInfo, type PenMode } from './createPenModes';
import styles from './FreeHandZone.module.css';
import { zonePaths, type Zone } from './geometry';
import { ModeIcon } from './ModeIcon';

/**
 * The free hand's zone as drawn: a quiet tinted half ellipse along its edge. Its own surface lets every press through
 * (the touches in it are taken by `createFreeHand`, pens draw through it); only the buttons in `children`, placed at
 * the top of the edge, take presses. The bottom of the edge shows what the pen does and with which color, size and
 * opacity.
 */
export function FreeHandZone(props: {
  zone: Zone;
  /** The free hand is touching the zone. */
  active: boolean;
  mode: PenMode;
  /** The mode is held by a finger rather than latched. */
  held: boolean;
  color: string;
  size: number;
  opacity: number;
  children: JSX.Element;
}) {
  const paths = () => zonePaths(props.zone);

  return (
    <div
      class={styles.zone}
      data-side={props.zone.side}
      data-active={props.active ? '' : undefined}
      style={{ width: `${props.zone.width}px` }}
    >
      <svg
        class={styles.surface}
        width={props.zone.width}
        height={props.zone.height}
        viewBox={`0 0 ${props.zone.width} ${props.zone.height}`}
        aria-hidden="true"
      >
        <path class={styles.area} d={paths().area} />
        <path class={styles.arc} d={paths().arc} />
      </svg>
      <div class={styles.buttons} data-hands-ui>
        {props.children}
      </div>
      <div class={styles.status} role="status" aria-label="Pen">
        <span class={styles.mode} data-held={props.held ? '' : undefined}>
          <ModeIcon mode={props.mode} size={16} />
          {penModeInfo[props.mode].label}
        </span>
        <span class={styles.values}>
          <span class={styles.swatch} style={{ background: props.color }} />
          {formatSize(props.size)} px · {Math.round(props.opacity * 100)}%
        </span>
      </div>
    </div>
  );
}

/** A brush size for display: tenths below 10 px, whole pixels above. */
export function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}
