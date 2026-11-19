import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { BlendMode } from '@app-game/paint-core/document';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { SettingsRow, SettingsRows } from '../../shared/ui/SettingsList';
import { blendPreview } from './blendPreview';
import styles from './LayersPanel.module.css';

/**
 * The layer blend mode as a dropdown, as in Photoshop's Layers panel: the button shows the current mode and opens a
 * list of the modes, each with what it does to two overlapping circles, rendered with the same composite as the
 * canvas, so that a mode can be chosen by its look rather than its name. The list is a plain Settings list
 * (`SettingsRows`): one row per mode with its circles on the row's tile, the current mode on a pill with its tile
 * ringed in the pill's ink; a host colors it through the list's `--settings-list-*` properties on `blendList`. It
 * closes on a choice, Escape or a press outside, window resize or ancestor scroll; the arrow keys, Home and End move
 * through it.
 */
export function BlendModePicker(props: {
  /** Host classes theme the trigger and top-layer menu without copying their behavior. */
  classes?: Record<string, string>;
  compact?: boolean;
  mode: BlendMode;
  /** Whether the document blends in linear light, which the previews show. */
  linear: boolean;
  onChange: (mode: BlendMode) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let menu!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  const current = () => modes.find((mode) => mode.id === props.mode) ?? modes[0];
  const choose = (mode: BlendMode) => {
    setOpen(false);
    trigger.focus();
    if (mode !== props.mode) {
      props.onChange(mode);
    }
  };

  createEventListener(
    () => (open() ? window : undefined),
    'resize',
    () => setOpen(false)
  );
  createEventListener(
    () => (open() ? window : undefined),
    'scroll',
    (event) => {
      // Scrolling the options does not move the trigger; only its ancestors do.
      if (event.target === document || (event.target instanceof Element && event.target.contains(trigger))) {
        setOpen(false);
      }
    },
    { capture: true, passive: true }
  );

  createEffect(open, (isOpen) => {
    if (!isOpen) {
      return;
    }

    menu.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${
      anchor.bottom + height + 4 <= window.innerHeight - 8 ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4)
    }px`;
    menu.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  });

  return (
    <div class={props.classes?.blendPicker ?? styles.blendPicker}>
      <button
        ref={trigger}
        class={props.classes?.blendTrigger ?? styles.blendTrigger}
        aria-label="Layer blend mode"
        aria-haspopup="listbox"
        aria-expanded={open() ? 'true' : 'false'}
        title={current().description}
        onClick={() => setOpen(!open())}
      >
        <Preview mode={current().id} linear={props.linear} />
        <Show when={!props.compact}>
          <span>{current().label}</span>
        </Show>
        <svg style={{ display: props.compact ? 'none' : undefined }} viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          ref={menu}
          popover="auto"
          class={[styles.blendList, props.classes?.blendList]}
          onToggle={(event) => {
            if (event.newState === 'closed') {
              setOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.focus();
            }
          }}
        >
          <SettingsRows role="listbox" label="Layer blend modes">
            <For each={modes} keyed={(mode) => mode.id}>
              {(item) => {
                const mode = item();

                return (
                  <SettingsRow
                    id={mode.id}
                    role="option"
                    label={mode.name}
                    title={mode.description}
                    selected={props.mode === mode.id}
                    tile={<Preview mode={mode.id} linear={props.linear} />}
                    onSelect={() => choose(mode.id)}
                  />
                );
              }}
            </For>
          </SettingsRows>
        </div>
      </Show>
    </div>
  );
}

/** One mode's preview, drawn into a canvas again when the document's blending changes. */
function Preview(props: { mode: BlendMode; linear: boolean }) {
  let canvas!: HTMLCanvasElement;
  createEffect(
    () => blendPreview(props.mode, props.linear),
    (pixels) => {
      const context = canvas.getContext('2d');

      if (context) {
        const image = context.createImageData(TILE_SIZE, TILE_SIZE);
        image.data.set(pixels);
        context.putImageData(image, 0, 0);
      }
    }
  );

  return <canvas ref={canvas} width={TILE_SIZE} height={TILE_SIZE} aria-hidden="true" />;
}

/** Modes in menu order, with a short label for the button, a one-line summary and a tooltip sentence. */
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
