import { createSignal, Show } from 'solid-js';
import { Beside } from './Beside';
import type { ArrivalHint } from './hints';
import styles from './panels.module.css';
import { near } from './placement';

/**
 * The gentle moment a control arrives: a small card beside it that says what it is and how to use it, until "Got
 * it". A card offering an action, such as a new layer, has it as its main button and "Not now" instead. The card
 * never stands in the pen's way: while the pointer over the drawing comes near, it fades and lets presses through.
 */
export function ArrivalCard(props: {
  hint: ArrivalHint;
  dock: HTMLElement | undefined;
  dockSide: 'left' | 'right';
  dockSize: { width: number | null; height: number | null };
  /** The pen, mouse or finger over the drawing, in client pixels. */
  pointer: { x: number; y: number } | undefined;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const [card, setCard] = createSignal<HTMLElement>();
  const yielding = () => {
    const pointer = props.pointer;
    const element = card();
    return pointer !== undefined && element !== undefined && near(pointer, element.getBoundingClientRect(), 32);
  };

  return (
    <Beside
      dock={props.dock}
      anchor={props.hint.anchor}
      dockSide={props.dockSide}
      dockSize={props.dockSize}
      class={styles.arrival}
      role="status"
      label={props.hint.title}
      ref={setCard}
      style={{ opacity: yielding() ? 0.12 : undefined, 'pointer-events': yielding() ? 'none' : undefined }}
    >
      <span class={styles.arrow} data-side={props.dockSide} aria-hidden="true" />
      <strong>{props.hint.title}</strong>
      <p>{props.hint.text}</p>
      <div class={styles.arrivalButtons}>
        <Show
          when={props.hint.action}
          fallback={
            <button class={styles.primary} onClick={() => props.onDismiss()}>
              Got it
            </button>
          }
        >
          <button class={styles.textButton} onClick={() => props.onDismiss()}>
            Not now
          </button>
          <button
            class={styles.primary}
            onClick={() => {
              props.onAction();
              props.onDismiss();
            }}
          >
            New layer
          </button>
        </Show>
      </div>
    </Beside>
  );
}
