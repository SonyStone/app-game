import { createSignal } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { tools, type ToolId } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import type { Motion, MotionKind } from './createMotion';
import { wheelNotch } from './dials';
import styles from './PadsVariant.module.css';

/**
 * The sixteen pads and what they do, with the pad that is pressed (by a pointer or its key) for lighting it. Row 1
 * navigates (Pan, Zoom, Rotate: hold and drag anywhere; Fit), rows 2–3 are the eight tools, row 4 is Undo, Redo
 * (tap, or drag sideways to scrub the history), Flip and Symmetry. Keys follow MPC's keyboard mode, laid out as the
 * pads are: 1 2 3 4 / Q W E R / A S D F / Z X C V. `picked` runs after a tool is chosen.
 */
export function createPads(studio: Studio, motion: Motion, picked: () => void) {
  const [pressed, setPressed] = createSignal<number>();
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const view = () => studio.view();
  const scrubbing = (index: number) => motion.kind() === 'history' && pressed() === index;
  const scrubText = () => {
    const steps = motion.scrubbed();
    return steps === 0 ? '±0' : steps < 0 ? `−${-steps}` : `+${steps}`;
  };

  const pads: readonly PadSpec[] = [
    { label: 'Pan', icon: 'pan', motion: 'pan', tap: () => {} },
    {
      label: 'Zoom',
      icon: 'zoom',
      motion: 'zoom',
      tap: () => studio.zoomTo(1, motion.pivot()),
      readout: () => `${Math.round(view().scale * 100)}%`,
      wheel: (steps) => studio.zoomBy(2 ** (steps / 4), motion.pivot())
    },
    {
      label: 'Rotate',
      icon: 'rotate',
      motion: 'rotate',
      tap: () => studio.rotateTo(0),
      readout: () => `${Math.round(view().angle)}°`,
      wheel: (steps) => studio.rotateBy(steps * 5, motion.pivot())
    },
    { label: 'Fit', icon: 'fullscreen', tap: () => studio.fit() },
    ...tools.map(
      (tool): PadSpec => ({
        label: toolLabels[tool.id],
        icon: tool.icon,
        tap() {
          studio.setTool(tool.id);
          picked();
        },
        lit: () => studio.tool() === tool.id
      })
    ),
    {
      label: 'Undo',
      icon: 'undo',
      motion: 'history',
      repeats: true,
      tap: () => studio.undo(),
      dim: () => !studio.canUndo(),
      readout: () => (scrubbing(12) ? scrubText() : `${studio.history().done || ''}`),
      wheel: (steps) => (steps < 0 ? studio.undo() : studio.redo())
    },
    {
      label: 'Redo',
      icon: 'redo',
      motion: 'history',
      repeats: true,
      tap: () => studio.redo(),
      dim: () => !studio.canRedo(),
      readout: () => (scrubbing(13) ? scrubText() : `${studio.history().undone || ''}`),
      wheel: (steps) => (steps < 0 ? studio.undo() : studio.redo())
    },
    { label: 'Flip', icon: 'mirror', tap: () => studio.flip(), lit: () => view().flipped },
    { label: 'Symmetry', icon: 'symmetry', tap: () => studio.toggleSymmetry(), lit: () => studio.symmetry() }
  ];

  return {
    pads,
    /** The pad held down by a pointer or a key, if any. */
    pressed,
    setPressed,
    /** Runs a pad from its key: taps it and lights it briefly, as a hardware pad flashes. */
    trigger(index: number) {
      pads[index]?.tap();
      clearTimeout(flashTimer);
      setPressed(index);
      flashTimer = setTimeout(() => setPressed(undefined), 110);
    }
  };
}

/** The pads as `createPads` returns them. */
export type PadBank = ReturnType<typeof createPads>;

/** One pad: its face and what a tap, a held drag (`motion`) and the wheel over it do. */
export type PadSpec = {
  label: string;
  icon: SketchIconName;
  tap: () => void;
  /** Hold-and-drag behavior; navigation pads tap only when the press is short. */
  motion?: MotionKind;
  /** Whether a held key repeats it, as Undo does. */
  repeats?: boolean;
  /** Lit warm white: the current tool, a view toggle that is on. */
  lit?: () => boolean;
  /** Greyed out: nothing to undo or redo. */
  dim?: () => boolean;
  /** A small live value in the corner, such as the zoom. */
  readout?: () => string;
  /** Wheel notches over the pad, positive away from the user. */
  wheel?: (steps: number) => void;
};

/** `KeyboardEvent.code` of each pad, in pad order; their letters are the hints printed on the pads. */
export const padCodes = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV'
] as const;

/**
 * The 4×4 pad grid. A press lights the pad; on Pan, Zoom and Rotate it navigates as the pointer moves anywhere and
 * the rest of the gear hides, leaving only the held pad; a short tap on Zoom gives 100 %, on Rotate 0°. Undo and
 * Redo scrub the history when dragged sideways. The wheel over Zoom, Rotate, Undo or Redo turns them too.
 */
export function PadGrid(props: { bank: PadBank; motion: Motion; ref?: (element: HTMLDivElement) => void }) {
  return (
    <div class={styles.pads} ref={props.ref}>
      {props.bank.pads.map((pad, index) => {
        let wheel = 0;
        const finish = () => {
          props.bank.setPressed(undefined);
          if (pad.motion) {
            props.motion.end();
          }
        };
        const handlers = pressHandlers({
          start(press) {
            props.bank.setPressed(index);
            if (pad.motion) {
              props.motion.begin(pad.motion, press.point);
            }
          },
          move(press) {
            if (pad.motion) {
              props.motion.move(press.point, press.shift, press.moved);
            }
          },
          end: finish,
          tap(press, event) {
            finish();
            const navigates = pad.motion !== undefined && pad.motion !== 'history';
            if (!navigates || event.timeStamp - press.time < quickTap) {
              pad.tap();
            }
          },
          cancel: finish
        });

        return (
          <button
            class={[
              styles.pad,
              {
                [styles.lit!]: pad.lit?.() || props.bank.pressed() === index,
                [styles.dim!]: pad.dim?.(),
                [styles.pressed!]: props.bank.pressed() === index,
                [styles.held!]: props.bank.pressed() === index && props.motion.hiding()
              }
            ]}
            {...galleryUi}
            {...handlers}
            onWheel={(event) => {
              if (!pad.wheel) {
                return;
              }

              event.preventDefault();
              wheel += event.deltaY || event.deltaX;
              if (Math.abs(wheel) >= wheelNotch) {
                pad.wheel(wheel < 0 ? 1 : -1);
                wheel = 0;
              }
            }}
            aria-label={pad.label}
          >
            <span class={styles.padKey}>{padCodes[index]!.replace(/^(Digit|Key)/, '')}</span>
            <span class={styles.padReadout}>{pad.readout?.()}</span>
            <SketchIcon name={pad.icon} size={20} />
            <span class={styles.padLabel}>{pad.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A press on a navigation pad shorter than this, without moving, is a tap that resets the view. */
const quickTap = 350;

const toolLabels: Record<ToolId, string> = {
  brush: 'Brush',
  mixer: 'Mixer',
  eraser: 'Eraser',
  picker: 'Picker',
  lasso: 'Lasso',
  transform: 'Transform',
  fill: 'Fill',
  gradient: 'Gradient'
};
