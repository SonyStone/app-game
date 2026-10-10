import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, untrack } from 'solid-js';
import { maxFeatherRadius } from '../../features/selection';
import type { PaintSession } from '../../features/session';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { TextButton } from './controls';
import type { Command, Menu } from './createDesktopCommands';
import { formatKeys } from './keys';
import styles from './Popup.module.css';

/**
 * A floating box under `anchor` (a toolbar button or menu title), kept inside the window: the variant's preset picker
 * and Feather box. Marked `data-popup`, so that the variant closes it on presses outside it. Reads `anchor` once.
 */
export function Popup(props: { anchor: HTMLElement; width: number; label: string; children: JSX.Element }) {
  const bounds = untrack(() => props.anchor.getBoundingClientRect());
  const left = Math.max(4, Math.min(innerWidth - props.width - 4, bounds.left));

  return (
    <div
      class={styles.popup}
      role="dialog"
      aria-label={props.label}
      data-popup
      style={{ left: `${left}px`, top: `${bounds.bottom + 2}px`, width: `${props.width}px` }}
    >
      {props.children}
    </div>
  );
}

/** Select › Feather: the radius in document pixels, applied with Apply or Enter. */
export function FeatherBox(props: { session: PaintSession; onDone: () => void }) {
  const [radius, setRadius] = createSignal(8);
  /** The radius as last set; `radius` shows a write only after the flush, too late for Enter's Apply. */
  let chosen = 8;
  const choose = (value: number) => {
    chosen = value;
    setRadius(value);
  };
  const apply = () => {
    props.session.selection.feather(chosen);
    props.onDone();
  };

  return (
    <div
      class={styles.feather}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // The field commits its typed value on blur, before Apply reads it.
          (event.target as HTMLElement).blur();
          queueMicrotask(apply);
        }
      }}
    >
      <span class={styles.title}>Feather selection</span>
      <span class={styles.row}>
        <span class={styles.caption}>Radius</span>
        <ScrubNumber
          label="Feather radius"
          value={radius()}
          min={1}
          max={maxFeatherRadius / 2}
          scale="log"
          unit="px"
          onInput={choose}
          onChange={choose}
        />
        <TextButton label="Cancel" onClick={props.onDone} />
        <TextButton label="Apply" onClick={apply} />
      </span>
    </div>
  );
}

/**
 * Help › Keyboard shortcuts: every menu's shortcuts and the tool keys, in columns, and the canvas gestures. A modal
 * dialog: Escape or the Close button closes it.
 */
export function ShortcutsSheet(props: {
  menus: readonly Menu[];
  tools: readonly Command[];
  apple: boolean;
  onClose: () => void;
}) {
  const [dialog, setDialog] = createSignal<HTMLDialogElement>();
  // Opened once mounted: a dialog must be in the document to open modally.
  createEffect(dialog, (element) => element?.showModal());
  const groups = () => [
    ...props.menus.map((menu) => ({
      label: menu.label,
      commands: menu.items.filter((item): item is Command => item !== 'separator' && item.keys !== undefined)
    })),
    { label: 'Tools', commands: [...props.tools] }
  ];

  return (
    <dialog ref={setDialog} class={styles.sheet} aria-label="Keyboard shortcuts" onClose={() => props.onClose()}>
      <header class={styles.sheetHeader}>
        <span class={styles.title}>Keyboard shortcuts</span>
        <TextButton label="Close" onClick={() => dialog()?.close()} />
      </header>
      <div class={styles.columns}>
        <For each={groups()}>
          {(group) => (
            <section class={styles.group}>
              <h3>{group.label}</h3>
              <For each={group.commands}>
                {(command) => (
                  <div class={styles.shortcut}>
                    <span>{command.label}</span>
                    <kbd>{formatKeys(command.keys!, props.apple)}</kbd>
                  </div>
                )}
              </For>
            </section>
          )}
        </For>
        <section class={styles.group}>
          <h3>Pen and touch</h3>
          <For each={gestures}>
            {([action, gesture]) => (
              <div class={styles.shortcut}>
                <span>{action}</span>
                <kbd>{gesture}</kbd>
              </div>
            )}
          </For>
        </section>
      </div>
    </dialog>
  );
}

/** Canvas gestures of every Paint variant, and this one's view keys. */
const gestures = [
  ['Undo', 'Two-finger tap'],
  ['Redo', 'Three-finger tap'],
  ['Pan, zoom, rotate', 'Two-finger drag'],
  ['View puck', 'Space, right button, pen button'],
  ['Pick a color', 'Alt + press'],
  ['Zoom', 'Wheel'],
  ['Hide the panels', 'Tab']
] as const;
