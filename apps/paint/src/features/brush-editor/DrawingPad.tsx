import type { BrushResource } from '@app-game/abr-paint/resources';
import { BrushPreview, type BrushPreviewActions } from '@app-game/brush-preview';
import type { Brush } from '@app-game/paint-core/brush';
import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, createUniqueId, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { studioBrushRecipe } from '../engine/studioBrushes';
import styles from './BrushEditor.module.css';

/**
 * A sheet of paper to try a brush on, for the brush studio's `pad` slot. It draws with the canvas's own stroke
 * pipeline (`studioBrushRecipe` through `BrushPreview`): pen pressure, tilt, rotation, coalesced events, smoothing
 * and the brush engines are those of a stroke on the drawing. It keeps a small scratch document of its own, in
 * memory, exactly as large as the pad is shown, so it never touches the user's document, its layers or its history.
 *
 * Each stroke keeps the brush it was drawn with: a change of a setting affects the strokes drawn after it, so two
 * strokes side by side compare two settings. Clear, beside the "Drawing pad" button, wipes the pad in one press; the
 * "Drawing pad" button opens the pad's other options, such as undoing the last stroke. A new size, as when the tablet turns, starts a new empty pad once the size has settled.
 */
export function DrawingPad(props: {
  /** The brush strokes on the pad use, as a stroke on the drawing would receive it. */
  brush: Brush;
  /** The images the brush refers to, such as an ABR tip, uploaded before the next stroke. */
  resources?: readonly BrushResource[];
  /** Maps raw pen pressure before the brush sees it, as the drawing's input does, such as a calibration curve. */
  mapPressure?: (raw: number) => number;
}) {
  const [frame, setFrame] = createSignal<HTMLElement>();
  const measured = createElementSize(frame);
  const size = createSettledSize(() => ({
    width: Math.floor(measured.width ?? 0),
    height: Math.floor(measured.height ?? 0)
  }));
  // Read only by the options' handlers; the canvas hands its commands over while it mounts.
  let actions: BrushPreviewActions | undefined;
  // The canvas reports its status from its own effects and engine events.
  const [status, setStatus] = createSignal('', { ownedWrite: true });

  return (
    <div class={styles.pad}>
      <div ref={setFrame} class={styles.padSheet}>
        <Show when={size()} keyed>
          {(current) => (
            <BrushPreview
              brush={props.brush}
              resources={props.resources}
              mapPressure={props.mapPressure}
              mixing={props.brush.mixing}
              recipe={studioBrushRecipe}
              width={current.width}
              height={current.height}
              redraw
              restyle={false}
              controls={false}
              actions={(given) => (actions = given)}
              onStatus={(message) => setStatus(message === 'Ready' ? '' : message)}
            />
          )}
        </Show>
      </div>
      <PadOptions onUndo={() => actions?.undo()} onClear={() => actions?.clear()} />
      <Show when={status()}>
        {(message) => (
          <p class={styles.padStatus} role="status">
            {message()}
          </p>
        )}
      </Show>
    </div>
  );
}

/**
 * The pad's size in whole CSS pixels once `measure` has stayed the same for {@link settleDelay}, so that a window
 * dragged to a new size makes one new pad rather than one per frame; the first size is taken at once. `undefined`
 * while the pad has no area.
 */
function createSettledSize(measure: () => { width: number; height: number }) {
  const [size, setSize] = createSignal<{ width: number; height: number }>();
  createEffect(measure, (next) => {
    const settle = () =>
      setSize((current) =>
        next.width < 1 || next.height < 1
          ? undefined
          : current?.width === next.width && current.height === next.height
            ? current
            : next
      );
    if (!untrack(size)) {
      settle();
      return;
    }

    const timer = setTimeout(settle, settleDelay);
    return () => clearTimeout(timer);
  });

  return size;
}

/** Milliseconds a new pad size must hold before the pad is made again at it. */
const settleDelay = 300;

/**
 * The "Drawing pad" button at the pad's top left, the Clear button beside it for the pad's most frequent action, and
 * the list of the other options the first opens under it. A press on an option runs it and closes the list; a press outside it
 * or Escape closes it.
 */
function PadOptions(props: { onUndo: () => void; onClear: () => void }) {
  const [open, setOpen] = createSignal(false);
  const [list, setList] = createSignal<HTMLElement>();
  const [button, setButton] = createSignal<HTMLElement>();
  const listId = createUniqueId();
  createEventListener(
    () => (open() ? document : undefined),
    'pointerdown',
    (event) => {
      const target = event.target;
      if (!(target instanceof Node && (list()?.contains(target) || button()?.contains(target)))) {
        setOpen(false);
      }
    },
    { capture: true }
  );
  const run = (option: () => void) => {
    setOpen(false);
    option();
  };

  return (
    <div class={styles.padOptions}>
      <button
        ref={setButton}
        type="button"
        class={styles.padButton}
        aria-haspopup="menu"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={listId}
        onClick={() => setOpen(!open())}
      >
        <SketchIcon name="pencil" size={18} />
        Drawing pad
      </button>
      <button type="button" class={styles.padButton} onClick={() => props.onClear()}>
        <SketchIcon name="trash" size={18} />
        Clear
      </button>
      <Show when={open()}>
        <div
          ref={setList}
          id={listId}
          class={styles.padMenu}
          role="menu"
          aria-label="Drawing pad"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              button()?.focus();
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => run(props.onUndo)}>
            <SketchIcon name="undo" size={18} />
            Undo last stroke
          </button>
        </div>
      </Show>
    </div>
  );
}
