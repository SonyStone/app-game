import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { BlendMode } from '@app-game/paint-core/document';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { blendPreview } from './blendPreview';
import styles from './LayersPanel.module.css';

/**
 * The layer blend mode as a dropdown, as in Photoshop's Layers panel: the button shows the current mode and opens a
 * list of the modes, each with what it does to two overlapping circles, rendered with the same composite as the
 * canvas, so that a mode can be chosen by its look rather than its name. The list closes on a choice, Escape or a
 * press outside; arrow keys move through it.
 */
export function BlendModePicker(props: {
  mode: BlendMode;
  /** Whether the document blends in linear light, which the previews show. */
  linear: boolean;
  onChange: (mode: BlendMode) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  const current = () => modes.find((mode) => mode.id === props.mode) ?? modes[0];
  const choose = (mode: BlendMode) => {
    setOpen(false);
    trigger.focus();
    if (mode !== props.mode) {
      props.onChange(mode);
    }
  };

  createEffect(open, (isOpen) => {
    if (!isOpen) {
      return;
    }

    root.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  });

  return (
    <div class={styles.blendPicker} ref={root}>
      <button
        ref={trigger}
        class={styles.blendTrigger}
        aria-label="Layer blend mode"
        aria-haspopup="listbox"
        aria-expanded={open() ? 'true' : 'false'}
        title={current().description}
        onClick={() => setOpen(!open())}
      >
        <Preview mode={current().id} linear={props.linear} />
        <span>{current().label}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          class={styles.blendList}
          role="listbox"
          aria-label="Layer blend modes"
          onKeyDown={(event) => {
            const options = [...root.querySelectorAll<HTMLElement>('[role="option"]')];
            const index = options.indexOf(document.activeElement as HTMLElement);
            const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
            if (step !== undefined) {
              event.preventDefault();
              options[(index + step + options.length) % options.length]?.focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.focus();
            }
          }}
        >
          <For each={modes}>
            {(mode) => (
              <button
                role="option"
                aria-selected={props.mode === mode.id ? 'true' : 'false'}
                aria-label={mode.name}
                onClick={() => choose(mode.id)}
              >
                <Preview mode={mode.id} linear={props.linear} />
                <span>
                  <strong>{mode.name}</strong>
                  <small>{mode.summary}</small>
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** One mode's preview, drawn into a canvas again when the document's blending changes. */
function Preview(props: { mode: BlendMode; linear: boolean }) {
  let canvas!: HTMLCanvasElement;
  createEffect(
    () => props.linear,
    (linear) => {
      canvas
        .getContext('2d')
        ?.putImageData(new ImageData(blendPreview(props.mode, linear), TILE_SIZE, TILE_SIZE), 0, 0);
    }
  );

  return <canvas ref={canvas} width={TILE_SIZE} height={TILE_SIZE} aria-hidden="true" />;
}

/** Modes in menu order, with a short label for the button, a one-line summary for the list and a tooltip sentence. */
const modes = [
  {
    id: 'normal',
    label: 'Normal',
    name: 'Normal',
    summary: 'Classic blend of encoded colors',
    description: 'Normal: the classic blend of encoded colors'
  },
  {
    id: 'multiply',
    label: 'Multiply',
    name: 'Multiply',
    summary: 'Darkens, like layered ink',
    description: 'Multiply: darkens, like layered transparent ink'
  },
  {
    id: 'screen',
    label: 'Screen',
    name: 'Screen',
    summary: 'Lightens, like projected light',
    description: 'Screen: lightens, like projected light'
  },
  {
    id: 'overlay',
    label: 'Overlay',
    name: 'Overlay',
    summary: 'Raises contrast',
    description: 'Overlay: raises contrast, darkening darks and lightening lights'
  }
] as const satisfies readonly { id: BlendMode; label: string; name: string; summary: string; description: string }[];
