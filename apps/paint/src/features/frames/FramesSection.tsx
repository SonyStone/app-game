import { createSignal, For, Show } from 'solid-js';
import styles from './Frames.module.css';
import type { Frame } from './framesFeature';

/**
 * The frame chooser at the top of the Layers panel: the whole canvas or one frame, and for the chosen frame its name
 * and actions: show it, export it as a PNG at 100%, copy a link that opens it, and delete it. A new frame goes around
 * the lasso selection, or else covers the view.
 */
export function FramesSection(props: {
  frames: readonly Frame[];
  active: Frame | undefined;
  disabled: boolean;
  onActivate: (id: string | undefined) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  /** Whether the active frame shows handles on the canvas for changing its rectangle. */
  adjusting: boolean;
  onAdjust: (adjusting: boolean) => void;
  onGoTo: (id: string) => void;
  onExport: (frame: Frame) => void;
  /** Copies a link to the frame; resolves whether it was copied. */
  onCopyLink: (id: string) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [copied, setCopied] = createSignal(false);

  return (
    <section class={styles.frames} aria-label="Frames">
      <div class={styles.row}>
        <label class={styles.choice}>
          <span>Frame</span>
          <select
            value={props.active?.id ?? ''}
            disabled={props.disabled}
            onChange={(event) => {
              const id = event.currentTarget.value || undefined;
              props.onActivate(id);
              if (id) {
                props.onGoTo(id);
              }
            }}
          >
            <option value="">Whole canvas</option>
            <For each={props.frames}>{(frame) => <option value={frame.id}>{frame.name}</option>}</For>
          </select>
        </label>
        <button
          title="Add a frame around the lasso selection, or else covering the view"
          disabled={props.disabled}
          onClick={() => props.onAdd()}
        >
          New frame
        </button>
      </div>
      <Show when={props.active} keyed>
        {(frame) => (
          <div class={styles.row}>
            <input
              class={styles.name}
              aria-label="Frame name"
              maxlength={64}
              value={frame.name}
              disabled={props.disabled}
              onChange={(event) => props.onRename(frame.id, event.currentTarget.value)}
            />
            <button aria-label="Show frame" title="Show the whole frame" onClick={() => props.onGoTo(frame.id)}>
              Show
            </button>
            <button
              aria-label="Adjust frame"
              title="Change the frame's rectangle with handles on the canvas"
              aria-pressed={props.adjusting ? 'true' : 'false'}
              disabled={props.disabled}
              onClick={() => props.onAdjust(!props.adjusting)}
            >
              Adjust
            </button>
            <button
              aria-label="Export frame as PNG"
              title="Export the frame as a PNG at 100%"
              onClick={() => props.onExport(frame)}
            >
              PNG
            </button>
            <button
              aria-label="Copy frame link"
              title="Copy a link that opens this frame on this device"
              onClick={() => void props.onCopyLink(frame.id).then(setCopied)}
              onBlur={() => setCopied(false)}
            >
              {copied() ? 'Copied' : 'Link'}
            </button>
            <button
              aria-label="Delete frame"
              title="Delete the frame; its paint stays"
              disabled={props.disabled}
              onClick={() => props.onRemove(frame.id)}
            >
              Delete
            </button>
          </div>
        )}
      </Show>
    </section>
  );
}
