import { For, Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { maxLocalUndoBrush, type LocalUndoSettings } from './createLocalUndo';
import styles from './LocalUndo.module.css';
import type { LocalUndoReply } from './localUndoEdit';

/**
 * Settings and session controls of the local undo: how the region is marked, how far back it returns, the mask
 * brush, what the open session shows, and Apply and Cancel.
 */
export function LocalUndoPanel(props: {
  settings: LocalUndoSettings;
  onChange: (patch: Partial<LocalUndoSettings>) => void;
  /** How many touching steps back a marked region returns. */
  depth: number;
  onDepth: (depth: number) => void;
  /** A session is open. */
  open: boolean;
  /** What the open session shows, once the engine replied. */
  shown: LocalUndoReply | undefined;
  onApply: () => void;
  onCancel: () => void;
}) {
  const marks = () => props.settings.mode !== 'tap';

  return (
    <section class={styles.panel}>
      <div class={styles.segments} role="group" aria-label="Mark the area with">
        <For each={modes}>
          {(mode) => (
            <button
              aria-pressed={props.settings.mode === mode.id ? 'true' : 'false'}
              title={mode.title}
              onClick={() => props.onChange({ mode: mode.id })}
            >
              {mode.label}
            </button>
          )}
        </For>
      </div>
      <Show when={marks()}>
        <div class={styles.segments} role="group" aria-label="New marks">
          <For each={areas}>
            {(area) => (
              <button
                aria-pressed={props.settings.area === area.id ? 'true' : 'false'}
                title={area.title}
                onClick={() => props.onChange({ area: area.id })}
              >
                {area.label}
              </button>
            )}
          </For>
        </div>
        <label class={styles.row}>
          <span>Steps back</span>
          <ScrubNumber
            label="Steps back"
            min={1}
            max={Math.max(1, props.shown?.kind === 'region' ? props.shown.count : 100)}
            value={props.depth}
            onInput={props.onDepth}
            onChange={props.onDepth}
          />
        </label>
      </Show>
      <Show when={props.settings.mode === 'brush'}>
        <label class={styles.row}>
          <span>Size</span>
          <ScrubNumber
            label="Mask brush size"
            min={1}
            max={maxLocalUndoBrush}
            scale="log"
            unit="px"
            value={props.settings.size}
            onInput={(size) => props.onChange({ size })}
            onChange={(size) => props.onChange({ size })}
          />
        </label>
        <label class={styles.row}>
          <span>Hardness</span>
          <ScrubNumber
            label="Mask brush hardness"
            min={0}
            max={100}
            unit="%"
            value={Math.round(props.settings.hardness * 100)}
            onInput={(percent) => props.onChange({ hardness: percent / 100 })}
            onChange={(percent) => props.onChange({ hardness: percent / 100 })}
          />
        </label>
      </Show>
      <p class={styles.status} role="status">
        {status(props.settings.mode, props.open, props.shown)}
      </p>
      <div class={styles.actions}>
        <button disabled={!props.open} onClick={() => props.onCancel()} title="Cancel · Escape">
          Cancel
        </button>
        <button class={styles.apply} disabled={!props.open} onClick={() => props.onApply()} title="Apply · Enter">
          Apply
        </button>
      </div>
      <p class={styles.note}>
        Returns pixels, not strokes: going back to a step also removes everything painted in the area after it. To
        remove an old stroke and keep newer ones over it, the stroke would have to be redrawn without it (planned).
      </p>
    </section>
  );
}

const modes = [
  { id: 'brush', label: 'Brush', title: 'Paint the area with a soft brush; Alt removes from it' },
  { id: 'lasso', label: 'Lasso', title: 'Outline the area; Shift adds, Alt subtracts' },
  { id: 'tap', label: 'Tap', title: 'Tap a stroke to undo it; tap again to go deeper' }
] as const satisfies readonly { id: LocalUndoSettings['mode']; label: string; title: string }[];

const areas = [
  { id: 'new', label: 'New', title: 'A lasso outline replaces the area; a brush stroke adds to it' },
  { id: 'add', label: 'Add', title: 'Add to the area · Shift' },
  { id: 'remove', label: 'Remove', title: 'Remove from the area · Alt' }
] as const satisfies readonly { id: LocalUndoSettings['area']; label: string; title: string }[];

/** The status line: what the session shows, or how to start one. */
function status(mode: LocalUndoSettings['mode'], open: boolean, shown: LocalUndoReply | undefined) {
  if (!open || !shown) {
    return mode === 'tap'
      ? 'Tap a stroke on the active layer.'
      : mode === 'lasso'
        ? 'Outline part of the active layer.'
        : 'Paint over part of the active layer.';
  }

  if (shown.kind === 'taps') {
    const removed = `${shown.removed} ${shown.removed === 1 ? 'step' : 'steps'} undone here`;
    return shown.found ? removed : `Nothing older to undo under the pen. ${removed}.`;
  }

  return shown.count
    ? `Step ${shown.depth} of ${shown.count} that changed this area`
    : 'No step in the history changed this area.';
}
