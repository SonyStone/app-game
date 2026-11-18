import styles from './LegoStudio.module.css';
import { PartFrame } from './PartFrame';

/**
 * A number setting's row in the brush studio, built from the setting's own value part (`kind`) as it lies on the
 * board: a grip and the part's slider across the row, one cell high. The slider is a live part editing through the
 * part's channel, as every copy on the board does, so the row and the board always show the same value; its value
 * chip opens number entry, as on the board. A setting that does not apply to the brush now shows the part's inactive
 * state and takes no edits.
 *
 * Only the grip lifts: a press on it calls `onLift` with the press, keeping the pointer captured by the grip so its
 * moves arrive while the studio is out of the way. Enter or Space on the focused grip calls `onPlace` instead, to put
 * the part on the board without dragging. `onBoard` marks the grip quietly, telling that a part of `kind` already
 * lies on the board.
 */
export function StudioSettingRow(props: {
  kind: string;
  /** The setting's name as a part on the board, which the grip's label speaks. */
  label: string;
  onBoard: boolean;
  onLift: (event: PointerEvent) => void;
  onPlace: () => void;
}) {
  return (
    <div class={styles.studioSetting} data-on-board={props.onBoard ? '' : undefined}>
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
        <PartFrame kind={props.kind} span={sliderSpan} look="slider" />
      </div>
    </div>
  );
}

/** The slider's span: the board's default for a brush setting, so it reads exactly as the part there. */
const sliderSpan = { columns: 4, rows: 1 };

/** Captures the press's pointer for its target, where the environment can, as a mouse press has no implicit capture. */
function capture(event: PointerEvent) {
  try {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  } catch {
    // A pointer the browser no longer knows, or no capture at all, as in jsdom; the board still follows the window.
  }
}
