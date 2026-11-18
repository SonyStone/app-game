import type { Span } from './board';
import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';

/**
 * A setting's row in the brush studio, built from the setting's own part (`kind`) as it lies on the board: a grip and
 * the part across the row, a number's slider one cell high, the pressure curve's graph taller (`tall`). The part is
 * live, editing through its channels as every copy on the board does, so the row and the board always show the same
 * values; its value chips open number entry, as on the board. A setting that does not apply to the brush now shows
 * the part's inactive state and takes no edits.
 *
 * Only the grip lifts: a press on it calls `onLift` with the press, keeping the pointer captured by the grip so its
 * moves arrive while the studio is out of the way. Enter or Space on the focused grip calls `onPlace` instead, to put
 * the part on the board without dragging. `onBoard` marks the grip quietly, telling that a part of `kind` already
 * lies on the board.
 */
export function StudioSettingRow(props: {
  kind: string;
  /** The span and look the part shows in the row, as a part of that span on the board would. */
  span: Span;
  look: string;
  /** A row as tall as the curve's graph wants, rather than one cell. */
  tall?: boolean;
  /** The setting's name as a part on the board, which the grip's label speaks. */
  label: string;
  onBoard: boolean;
  onLift: (event: PointerEvent) => void;
  onPlace: () => void;
}) {
  return (
    <div
      class={styles.studioSetting}
      data-on-board={props.onBoard ? '' : undefined}
      data-tall={props.tall ? '' : undefined}
    >
      <button
        type="button"
        class={styles.studioGrip}
        aria-label={`Drag ${props.label} onto the board${props.onBoard ? ' (on the board)' : ''}`}
        aria-keyshortcuts="Enter Space"
        title={props.onBoard ? `${props.label} is on the board` : `Drag ${props.label} onto the board`}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          capture(event);
          props.onLift(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onPlace();
          }
        }}
      >
        <span class={styles.studioGripDots} />
      </button>
      <div class={styles.studioTile}>
        <PartFrame kind={props.kind} span={props.span} look={props.look} />
      </div>
    </div>
  );
}

/** Captures the press's pointer for its target, where the environment can, as a mouse press has no implicit capture. */
function capture(event: PointerEvent) {
  try {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  } catch {
    // A pointer the browser no longer knows, or no capture at all, as in jsdom; the board still follows the window.
  }
}
