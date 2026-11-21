import type { BrushResource } from '@app-game/abr-paint/resources';
import { BrushPreview, type BrushPreviewActions } from '@app-game/brush-preview';
import type { Brush } from '@app-game/paint-core/brush';
import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, createUniqueId, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { studioBrushRecipe } from '../engine/studioBrushes';
import styles from './BrushEditor.module.css';
import { brushErases } from './brushErases';

/**
 * A sheet of paper to try a brush on, for the brush studio's `pad` slot. It draws with the canvas's own stroke
 * pipeline (`studioBrushRecipe` through `BrushPreview`): pen pressure, tilt, rotation, coalesced events, smoothing
 * and the brush engines are those of a stroke on the drawing. It keeps a small scratch document of its own, in
 * memory, exactly as large as the pad is shown, so it never touches the user's document, its layers or its history.
 *
 * The strokes on the pad follow the brush: a change of a setting draws them all again with it, so a slider's effect
 * shows on what is already drawn. The options menu's "Keep strokes as drawn" turns that off, each stroke then keeping
 * the brush it was drawn with, so two strokes side by side compare two settings. While the pad is empty, a quiet hint
 * in its middle invites a stroke. While the brush erases (`brushErases`), the pad is washed in a mid-tone under the
 * strokes, so that erasing leaves a visible mark. Undo and Clear at the top left act on the strokes in one press; the
 * options button beside them opens the pad's options. A new size, as when the tablet turns, starts a new empty pad
 * once the size has settled.
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
  const [strokes, setStrokes] = createSignal(0, { ownedWrite: true });
  /** Whether strokes keep the brush they were drawn with rather than follow the brush's changes. */
  const [keep, setKeep] = createSignal(false);

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
              restyle={!keep()}
              backdrop={brushErases(props.brush) ? erasingWash : undefined}
              controls={false}
              actions={(given) => (actions = given)}
              onStatus={(message) => setStatus(message === 'Ready' ? '' : message)}
              onStrokes={setStrokes}
            />
          )}
        </Show>
        <Show when={strokes() === 0}>
          <p class={styles.padHint} aria-hidden="true">
            Draw here to try the brush
          </p>
        </Show>
      </div>
      <PadOptions keep={keep()} onKeep={setKeep} onUndo={() => actions?.undo()} onClear={() => actions?.clear()} />
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

/** The mid-tone the pad is washed in while the brush erases, dark enough for the erased paper to stand out. */
const erasingWash = '#8e9aa6';

/**
 * The pad's buttons at its top left: Undo and Clear, its most frequent actions, then the options button, whose list
 * opens under it: "Keep strokes as drawn" (`keep`), a check that `onKeep` changes. A press on an option runs it and
 * closes the list; a press outside it or Escape closes it.
 */
function PadOptions(props: {
  keep: boolean;
  onKeep: (keep: boolean) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
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
      <button type="button" class={styles.padButton} onClick={() => props.onUndo()}>
        <SketchIcon name="undo" size={18} />
        Undo
      </button>
      <button type="button" class={styles.padButton} onClick={() => props.onClear()}>
        <SketchIcon name="trash" size={18} />
        Clear
      </button>
      <button
        ref={setButton}
        type="button"
        class={styles.padButton}
        aria-label="Pad options"
        title="Pad options"
        aria-haspopup="menu"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={listId}
        onClick={() => setOpen(!open())}
      >
        <SketchIcon name="more" size={18} />
      </button>
      <Show when={open()}>
        <div
          ref={setList}
          id={listId}
          class={styles.padMenu}
          role="menu"
          aria-label="Pad options"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              button()?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={props.keep ? 'true' : 'false'}
            onClick={() => run(() => props.onKeep(!props.keep))}
          >
            <Show when={props.keep} fallback={<span class={styles.padCheckSpace} />}>
              <SketchIcon name="check" size={18} />
            </Show>
            Keep strokes as drawn
          </button>
        </div>
      </Show>
    </div>
  );
}
